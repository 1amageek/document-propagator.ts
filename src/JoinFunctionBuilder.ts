import { Firestore } from "firebase-admin/firestore"
import { CloudFunction, ParamsOf } from "firebase-functions/v2"
import { onDocumentWritten, DocumentOptions, Change, FirestoreEvent, DocumentSnapshot } from "firebase-functions/v2/firestore"
import { JoinDependencyResource, getTargetPath, replaceDependencyData, encode, JoinQuery, getPath } from "./helper"
import { Context, Data } from "./Interface"
import { v4 as uuidv4 } from 'uuid'

export class JoinFunctionBuilder {

  firestore: Firestore

  constructor(firestore: Firestore) {
    this.firestore = firestore
  }

  build<Document extends string>(
    options: Partial<DocumentOptions> | null,
    query: JoinQuery,
    shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
    dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
  ): CloudFunction<FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>> {
    const triggerResource = query.from as Document
    const _options: DocumentOptions<Document> = { ...options, document: triggerResource }
    return onDocumentWritten<Document>(_options, (event) => {
      const params = event.params
      const change = event.data!
      const group = query.group
      if (!group) {
        const targetResource = query.to
        const dependencies = query.resources
        const targetPath = getTargetPath(params, triggerResource, targetResource)
        const _context: Context<Document> = { event: event, targetPath, groupValue: null }
        if (change.before.exists) {
          if (change.after.exists) {
            return onUpdate(this.firestore, change, _context, change.after, dependencies, shouldRunFunction, dataHandler, callback)
          } else {
            return onDelete(this.firestore, _context, change.before, shouldRunFunction)
          }
        } else {
          return onCreate(this.firestore, change, _context, change.after, dependencies, shouldRunFunction, dataHandler, callback)
        }
      }
      const tasks = group.values.map(async (value) => {
        const dependencies = query.resources.map(resource => {
          const _resource = getPath(resource.resource, { [group.documentID]: value })
          return { ...resource, resource: _resource }
        })
        const path = getTargetPath<Document>(params, triggerResource, query.to)
        const targetPath = getPath(path, { [group.documentID]: value })
        const _context: Context<Document> = { event: event, targetPath, groupValue: value }
        if (change?.before.exists) {
          if (change.after.exists) {
            return onUpdate(this.firestore, change, _context, change.after, dependencies, shouldRunFunction, dataHandler, callback)
          } else {
            return onDelete(this.firestore, _context, change.before, shouldRunFunction)
          }
        } else {
          return onCreate(this.firestore, change, _context, change.after, dependencies, shouldRunFunction, dataHandler, callback)
        }
      })
      return Promise.all(tasks)
    })
  }
}

const onCreate = async <Document extends string>(
  firestore: Firestore,
  change: Change<DocumentSnapshot>,
  context: Context<Document>,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
  dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
  callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
) => {
  if (!shouldRunFunction(context, snapshot)) {
    return
  }
  const data = await dataHandler(context, change)
  const [dependence, results] = await replaceDependencyData(firestore, context, dependencies, data, callback)
  const documentData = encode({
    ...data,
    ...results,
    createTime: snapshot.updateTime!.toDate(),
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
    __propageteID: uuidv4()
  })
  const targetPath = context.targetPath
  return await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}

const onUpdate = async <Document extends string>(
  firestore: Firestore,
  change: Change<DocumentSnapshot>,
  context: Context<Document>,
  snapshot: DocumentSnapshot,
  dependencies: JoinDependencyResource[],
  shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
  dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
  callback: (context: Context<Document>, snapshot: DocumentSnapshot) => Data
) => {
  if (!shouldRunFunction(context, snapshot)) {
    return
  }
  const data = await dataHandler(context, change)
  const targetPath = context.targetPath
  const [dependence, results] = await replaceDependencyData(firestore, context, dependencies, data, callback)
  const documentData = encode({
    ...data,
    ...results,
    updateTime: snapshot.updateTime!.toDate(),
    __dependencies: dependence.dependencies,
    __propageteID: uuidv4()
  })
  return await firestore
    .doc(targetPath)
    .set(documentData, { merge: true })
}

const onDelete = async <Document extends string>(
  firestore: Firestore,
  context: Context<Document>,
  snapshot: DocumentSnapshot,
  shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
) => {
  if (!shouldRunFunction(context, snapshot)) {
    return
  }
  const targetPath = context.targetPath
  return await firestore
    .doc(targetPath)
    .delete()
}
