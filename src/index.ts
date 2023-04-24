import * as functions from "firebase-functions/v1"
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1"
import { DependencyResource, Field, getCollectionIDs, getPropagateTargets, groupBy, JoinDependencyResource, JoinQuery, Target, Data } from "./helper"
import { PropagateFunctionBuilder } from "./PropagateFunctionBuilder"
import { JoinFunctionBuilder } from "./JoinFunctionBuilder"
import { Firestore, DocumentSnapshot, DocumentData } from "firebase-admin/firestore"


/**
 * 
 * @param from DocumentReference with wildcards for the original data
 * @param to DocumentReference with wildcards for joind data
 * @param resources Data required for join
 * @returns Returns a joinQuery. This is used by resolve.
 */
export const joinQuery = (from: string, to: string, resources: JoinDependencyResource[]): JoinQuery => {
  return { from, to, resources }
}

/**
 * 
 * @param documentID DocumentID of source data
 * @param field Field name to join to
 * @param resource Path of CollectionReference with wildcards "/users/{userID}"
 */
export const depedencyResource = (documentID: string, field: Field, resource: string) => {
  return { documentID, field, resource }
}

export const resolve = (
  firestore: Firestore,
  options: {
    regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
    runtimeOptions?: RuntimeOptions
  } | null,
  queries: JoinQuery[] = [],
  joinSnapshotHandler: ((snapshot: DocumentSnapshot<DocumentData>) => boolean) | null = null,
  joinCallback: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null = null,
  propagateSnapshotHandler: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => boolean) | null = null,
  propagateCallback: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null = null,
) => {
  return {
    j: join(firestore, options, queries, joinSnapshotHandler, joinCallback),
    p: propagate(firestore, options, getPropagateTargets(queries), propagateSnapshotHandler, propagateCallback)
  }
}


/**
 * Triggered when the original data is updated to collect the required data and generate the joined data.
 * @param firestore Firestore for AdminApp
 * @param queries Enter the data required for the trigger path or join.
 * @param callback If you need to process the acquired data, you can change it here.
 * @returns Returns the FunctionBuilder to be deployed.
 */
export const join = <Data extends { [key: string]: any }>(
  firestore: Firestore,
  options: {
    regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
    runtimeOptions?: RuntimeOptions
  } | null,
  queries: JoinQuery[] = [],
  snapshotHandler: ((snapshot: DocumentSnapshot<DocumentData>) => boolean) | null = null,
  callback: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null = null
) => {
  const builder = new JoinFunctionBuilder(firestore)
  const defaultSnapshotHandler = (snapshot: DocumentSnapshot<DocumentData>) => {
    return true
  }
  const defaultCallback = (snapshot: DocumentSnapshot<DocumentData>) => {
    return { ...snapshot.data(), id: snapshot.id } as any
  }
  const _snapshotHandler = snapshotHandler ?? defaultSnapshotHandler
  const _callback = callback ?? defaultCallback
  const functionNames = queries.reduce<string[]>((prev, query) => {
    const collectionIDs = getCollectionIDs(query.from)
    return prev.concat(collectionIDs)
  }, [])
  const duplicateFunctionNames = functionNames.filter((x, i, arr) => arr.includes(x, i + 1))
  const documentFunctions: DocumentFunction[] = queries.map(query => {
    const collectionIDs = getCollectionIDs(query.from)
    const names = collectionIDs.map(id => compress(id, duplicateFunctionNames))
    const onWrite = builder.build(options, query.from, query.to, query.resources, _snapshotHandler, _callback)
    return { name: [...names, "on"], on: onWrite }
  })
  return convert(documentFunctions)
}

/**
 * When the data of the dependent data is updated, the post-merge data is also updated.
 * @param targets 
 * @returns Returns the FunctionBuilder to be deployed.
 */
export const propagate = (
  firestore: Firestore,
  options: {
    regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
    runtimeOptions?: RuntimeOptions
  } | null,
  targets: Target[],
  snapshotHandler: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => boolean) | null = null,
  callback: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => Data) | null = null
) => {
  const resources = targets.flatMap(target => {
    return target.dependencies.map(dependency => {
      return { targetResource: target.resource, field: dependency.field, depedencyResource: dependency.resource }
    })
  })
  const defaultCallback = (before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => {
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
  const documentFunctions: DocumentFunction[] = Object.keys(dependencies).map(triggerResource => {
    const collectionIDs = getCollectionIDs(triggerResource)
    const names = collectionIDs.map(id => compress(id, duplicateFunctionNames))
    const depedencyResources: DependencyResource[] = dependencies[triggerResource]!.map(v => {
      return {
        field: v.field,
        resource: v.targetResource
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

type DocumentFunction = {
  name: string[]
  on: functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>>
}

const convert = (arr: DocumentFunction[]): { [key: string]: any } => {
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