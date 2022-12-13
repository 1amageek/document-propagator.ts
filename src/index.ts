import { DependencyResource, Field, getCollectionIDs, getPropagateTargets, groupBy, JoinDependencyResource, JoinQuery, Target } from "./helper"
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

export const resolve = <Data extends { [key: string]: any }>(firestore: Firestore, queries: JoinQuery[] = [], callback: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null = null) => {
  return {
    j: join(firestore, queries, callback),
    p: propagate(firestore, getPropagateTargets(queries))
  }
}


/**
 * Triggered when the original data is updated to collect the required data and generate the joined data.
 * @param firestore Firestore for AdminApp
 * @param queries Enter the data required for the trigger path or join.
 * @param callback If you need to process the acquired data, you can change it here.
 * @returns Returns the FunctionBuilder to be deployed.
 */
export const join = <Data extends { [key: string]: any }>(firestore: Firestore, queries: JoinQuery[] = [], callback: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null = null) => {
  const builder = new JoinFunctionBuilder(firestore)
  const defaultCallback = (snapshot: DocumentSnapshot<DocumentData>) => {
    return snapshot.data() as Data
  }
  const _callback = callback ?? defaultCallback
  const data: DocumentFunction[] = queries.map(query => {
    const collectionIDs = getCollectionIDs(query.from)
    const onWrite = builder.build(null, query.from, query.to, query.resources, _callback)
    return { name: [...collectionIDs], on: onWrite }
  })
  return convert(data)
}

/**
 * When the data of the dependent data is updated, the post-merge data is also updated.
 * @param targets 
 * @returns Returns the FunctionBuilder to be deployed.
 */
export const propagate = (firestore: Firestore, targets: Target[]) => {
  const resources = targets.flatMap(target => {
    return target.dependencies.map(dependency => {
      return { targetResource: target.resource, field: dependency.field, depedencyResource: dependency.resource }
    })
  })
  const dependencies = groupBy(resources, (resource) => resource.depedencyResource)
  const functionBuilder = new PropagateFunctionBuilder(firestore)

  let _functions = {} as any
  Object.keys(dependencies).forEach(triggerResource => {
    const functionName = getCollectionIDs(triggerResource).join("-")
    const depedencyResources: DependencyResource[] = dependencies[triggerResource]!.map(v => {
      return {
        field: v.field,
        resource: v.targetResource
      }
    })
    _functions[functionName] = functionBuilder.build(null, triggerResource, depedencyResources)
  })
  return _functions
}

type DocumentFunction = {
  name: string[]
  on: () => void
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