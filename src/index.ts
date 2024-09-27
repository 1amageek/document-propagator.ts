import { CloudFunction, Change, ParamsOf } from "firebase-functions/v2"
import { DocumentOptions, FirestoreEvent, DocumentSnapshot } from "firebase-functions/v2/firestore"
import { DependencyResource, getCollectionIDs, getPropagateTargets, groupBy, JoinDependencyResource, JoinQuery, PathGroup } from "./helper"
import { Context, Field, Data } from "./Interface"
import { PropagateFunctionBuilder } from "./PropagateFunctionBuilder"
import { JoinFunctionBuilder } from "./JoinFunctionBuilder"
import { Firestore } from "firebase-admin/firestore"


/**
 * 
 * @param from DocumentReference with wildcards for the original data
 * @param to DocumentReference with wildcards for joind data
 * @param resources Data required for join
 * @returns Returns a joinQuery. This is used by resolve.
 */
export const joinQuery = (from: string, to: string, resources: JoinDependencyResource[], group: PathGroup | undefined): JoinQuery => {
  return { from, to, resources, group }
}

/**
 * 
 * @param documentID DocumentID of source data
 * @param field Field name to join to
 * @param resource Path of CollectionReference with wildcards "/users/{userID}"
 */
export const dependencyResource = (documentID: string, field: Field, resource: string) => {
  return { documentID, field, resource }
}

export const resolve = <Document extends string>(
  firestore: Firestore,
  options: Partial<DocumentOptions> | null,
  queries: JoinQuery[] = [],
  shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
  dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
  joinCallback: ((context: Context<Document>, snapshot: DocumentSnapshot) => Data) | null = null,
  propagateSnapshotHandler: ((before: DocumentSnapshot, after: DocumentSnapshot) => boolean) | null = null,
  propagateCallback: ((snapshot: DocumentSnapshot) => Data) | null = null,
) => {
  return {
    j: join(firestore, options, queries, shouldRunFunction, dataHandler, joinCallback),
    p: propagate(firestore, options, queries, propagateSnapshotHandler, propagateCallback)
  }
}


/**
 * Triggered when the original data is updated to collect the required data and generate the joined data.
 * @param firestore Firestore for AdminApp
 * @param queries Enter the data required for the trigger path or join.
 * @param callback If you need to process the acquired data, you can change it here.
 * @returns Returns the FunctionBuilder to be deployed.
 */
export const join = <Document extends string>(
  firestore: Firestore,
  options: Partial<DocumentOptions> | null,
  queries: JoinQuery[] = [],
  shouldRunFunction: (context: Context<Document>, snapshot: DocumentSnapshot) => boolean,
  dataHandler: (context: Context<Document>, change: Change<DocumentSnapshot>) => Promise<Data>,
  callback: ((context: Context<Document>, snapshot: DocumentSnapshot) => Data) | null = null
) => {
  const builder = new JoinFunctionBuilder(firestore)
  const defaultSnapshotHandler = (context: Context<Document>, snapshot: DocumentSnapshot) => {
    return true
  }
  const defaultCallback = (context: Context<Document>, snapshot: DocumentSnapshot) => {
    return { ...snapshot.data(), id: snapshot.id } as any
  }
  const _shouldRunFunction = shouldRunFunction ?? defaultSnapshotHandler
  const _callback = callback ?? defaultCallback
  const functionNames = queries.reduce<string[]>((prev, query) => {
    const collectionIDs = getCollectionIDs(query.from)
    return prev.concat(collectionIDs)
  }, [])
  const duplicateFunctionNames = functionNames.filter((x, i, arr) => arr.includes(x, i + 1))
  const documentFunctions: DocumentFunction<Document>[] = queries.map(query => {
    const collectionIDs = getCollectionIDs(query.from)
    const names = collectionIDs.map(id => compress(id, duplicateFunctionNames))
    const onWrite = builder.build(options, query, _shouldRunFunction, dataHandler, _callback)
    return { name: [...names, "on"], on: onWrite }
  })
  return convert(documentFunctions)
}

/**
 * When the data of the dependent data is updated, the post-merge data is also updated.
 * @param targets 
 * @returns Returns the FunctionBuilder to be deployed.
 */
export const propagate = <Document extends string>(
  firestore: Firestore,
  options: Partial<DocumentOptions> | null,
  queries: JoinQuery[] = [],
  snapshotHandler: ((before: DocumentSnapshot, after: DocumentSnapshot) => boolean) | null = null,
  callback: ((before: DocumentSnapshot, after: DocumentSnapshot) => Data) | null = null
) => {
  const targets = getPropagateTargets(queries)
  const resources = targets.flatMap(target => {
    return target.dependencies.map(dependency => {
      return { from: target.from, to: target.to, documentID: dependency.documentID, field: dependency.field, depedencyResource: dependency.resource, group: target.group }
    })
  })
  const defaultCallback = (before: DocumentSnapshot, after: DocumentSnapshot) => {
    return { ...after.data(), id: after.id } as any
  }
  const _callback = callback ?? defaultCallback
  const dependencies = groupBy(resources, (resource) => resource.depedencyResource)
  const builder = new PropagateFunctionBuilder(firestore)
  const functionNames = Object.keys(dependencies).reduce<string[]>((prev, triggerResource) => {
    const collectionIDs = getCollectionIDs(triggerResource)
    return prev.concat(collectionIDs)
  }, [])
  const duplicateFunctionNames = functionNames.filter((x, i, arr) => arr.includes(x, i + 1))
  const documentFunctions: DocumentFunction<Document>[] = Object.keys(dependencies).map(triggerResource => {
    const collectionIDs = getCollectionIDs(triggerResource)
    const names = collectionIDs.map(id => compress(id, duplicateFunctionNames))
    const depedencyResources: DependencyResource[] = dependencies[triggerResource]!.map(v => {
      return {
        from: v.from,
        to: v.to,
        field: v.field,
        resource: v.to,
        documentID: v.documentID,
        group: v.group
      }
    })
    const onWrite = builder.build(options, triggerResource, depedencyResources, snapshotHandler, _callback)
    return { name: [...names, "on"], on: onWrite }
  })
  return convert(documentFunctions)
}

const compress = (name: string, list: string[]) => {
  if (list.includes(name)) {
    if (name.length > 1) {
      return name.slice(0, 5)
    }
    return name[0]
  } else {
    return name
  }
}

type DocumentFunction<Document extends string> = {
  name: string[]
  on: CloudFunction<FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>>
}

const convert = <Document extends string>(arr: DocumentFunction<Document>[]): { [key: string]: any } => {
  const result: any = {};
  for (const subArr of arr) {
    let current: any = result;
    for (let i = 0; i < subArr.name.length; i++) {
      const element = subArr.name[i];
      if (!(element in current)) {
        current[element] = {}
      }
      if (i === subArr.name.length - 1) {
        current[element] = subArr.on
      }
      current = current[element];
    }
  }
  return result
}