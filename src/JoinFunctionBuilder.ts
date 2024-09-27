import { Firestore } from "firebase-admin/firestore"
import { CloudFunction, ParamsOf } from "firebase-functions/v2"
import { onDocumentWritten, DocumentOptions, Change, FirestoreEvent, DocumentSnapshot } from "firebase-functions/v2/firestore"
import { JoinDependencyResource, getTargetPath, replaceDependencyData, encode, JoinQuery, getPath } from "./helper"
import { Context, Data } from "./Interface"
import { v4 as uuidv4 } from 'uuid'

/**
 * A builder class for creating join functions in Firestore.
 */
export class JoinFunctionBuilder {
  private firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  /**
   * Builds a Cloud Function for joining data based on the provided query and options.
   * @param options - Partial DocumentOptions or null
   * @param query - JoinQuery object defining the join operation
   * @param shouldRunFunction - Function to determine if the join should be executed
   * @param dataHandler - Function to handle data changes
   * @param callback - Function to process the snapshot data
   * @returns A Cloud Function that performs the join operation
   */
  build<Document extends string>(
    options: Partial<DocumentOptions> | null,
    query: JoinQuery,
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
    dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
  ): CloudFunction<FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>> {
    const triggerResource = query.from as Document;
    const _options: DocumentOptions<Document> = { ...options, document: triggerResource };

    return onDocumentWritten<Document>(_options, async (event) => {
      const { params, data: change } = event;
      if (!change) {
        console.warn("No change data available. Skipping join operation.");
        return;
      }

      const group = query.group;
      if (!group) {
        return this.handleSingleDocument(event, query, change, params, triggerResource, shouldRunFunction, dataHandler, callback);
      }

      const tasks = group.values.map(value => 
        this.handleGroupDocument(event, query, change, params, triggerResource, value, group.documentID, shouldRunFunction, dataHandler, callback)
      );

      await Promise.all(tasks);
    });
  }

  private async handleSingleDocument<Document extends string>(
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>,
    query: JoinQuery,
    change: Change<DocumentSnapshot>,
    params: ParamsOf<Document>,
    triggerResource: Document,
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
    dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
  ): Promise<void> {
    const targetResource = query.to;
    const dependencies = query.resources;
    const targetPath = getTargetPath(params, triggerResource, targetResource);
    const context: Context<Document> = { event, triggerResource, targetPath, groupValue: null };

    if (change.before.exists && change.after.exists) {
      await this.onUpdate(change, context, change.after, dependencies, shouldRunFunction, dataHandler, callback);
    } else if (change.before.exists) {
      await this.onDelete(context, change.before, shouldRunFunction);
    } else if (change.after.exists) {
      await this.onCreate(change, context, change.after, dependencies, shouldRunFunction, dataHandler, callback);
    }
  }

  private async handleGroupDocument<Document extends string>(
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>,
    query: JoinQuery,
    change: Change<DocumentSnapshot>,
    params: ParamsOf<Document>,
    triggerResource: Document,
    groupValue: string,
    groupDocumentID: string,
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
    dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
  ): Promise<void> {
    const dependencies = query.resources.map(resource => ({
      ...resource,
      resource: getPath(resource.resource, { [groupDocumentID]: groupValue })
    }));

    const path = getTargetPath<Document>(params, triggerResource, query.to);
    const targetPath = getPath(path, { [groupDocumentID]: groupValue });
    const context: Context<Document> = { event, triggerResource, targetPath, groupValue };

    if (change.before.exists && change.after.exists) {
      await this.onUpdate(change, context, change.after, dependencies, shouldRunFunction, dataHandler, callback);
    } else if (change.before.exists) {
      await this.onDelete(context, change.before, shouldRunFunction);
    } else if (change.after.exists) {
      await this.onCreate(change, context, change.after, dependencies, shouldRunFunction, dataHandler, callback);
    }
  }

  private async onCreate<Document extends string>(
    change: Change<DocumentSnapshot>,
    context: Context<Document>,
    snapshot: DocumentSnapshot,
    dependencies: JoinDependencyResource[],
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
    dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
  ): Promise<void> {
    if (!shouldRunFunction(context, snapshot)) {
      return;
    }

    try {
      const data = await dataHandler(context, change);
      const [dependence, results] = await replaceDependencyData(this.firestore, context, dependencies, data, callback);
      const documentData = encode({
        ...data,
        ...results,
        createTime: snapshot.createTime!.toDate(),
        updateTime: snapshot.updateTime!.toDate(),
        __dependencies: dependence.dependencies,
        __propagateID: uuidv4()
      });

      await this.firestore.doc(context.targetPath).set(documentData, { merge: true });
    } catch (error) {
      console.error(`Error in onCreate for document ${context.targetPath}:`, error);
    }
  }

  private async onUpdate<Document extends string>(
    change: Change<DocumentSnapshot>,
    context: Context<Document>,
    snapshot: DocumentSnapshot,
    dependencies: JoinDependencyResource[],
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
    dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
  ): Promise<void> {
    if (!shouldRunFunction(context, snapshot)) {
      return;
    }

    try {
      const data = await dataHandler(context, change);
      const [dependence, results] = await replaceDependencyData(this.firestore, context, dependencies, data, callback);
      const documentData = encode({
        ...data,
        ...results,
        updateTime: snapshot.updateTime!.toDate(),
        __dependencies: dependence.dependencies,
        __propagateID: uuidv4()
      });

      await this.firestore.doc(context.targetPath).set(documentData, { merge: true });
    } catch (error) {
      console.error(`Error in onUpdate for document ${context.targetPath}:`, error);
    }
  }

  private async onDelete<Document extends string>(
    context: Context<Document>,
    snapshot: DocumentSnapshot,
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
  ): Promise<void> {
    if (!shouldRunFunction(context, snapshot)) {
      return;
    }

    try {
      await this.firestore.doc(context.targetPath).delete();
    } catch (error) {
      console.error(`Error in onDelete for document ${context.targetPath}:`, error);
    }
  }
}