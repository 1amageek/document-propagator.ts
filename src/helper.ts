import { Firestore } from "firebase-admin/firestore";
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { Dependence } from "./Dependence";

const WILDCARD_REGEX = new RegExp('{[^/{}]*}', 'g')

export type CollectionReferenceResource = string

export type DocumentReferencePath = string

export type Field = string

export type Target = {
  resource: string,
  dependencies: DependencyResource[]
}

export type JoinQuery = {
  from: string
  to: string
  resources: JoinDependencyResource[]
}

export type JoinDependencyResource = {
  documentID: string
  field: Field
  resource: string
}

export type DependencyResource = {
  field: Field
  resource: string
}

export type TargetResource = {
  field: Field
  resource: string
}

export const replaceDependencyData = async <Data>(
  firestore: Firestore,
  dependencyResources: JoinDependencyResource[],
  data: DocumentData,
  callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
): Promise<[Dependence, { [x: string]: any }[]]> => {
  const dependence = new Dependence(firestore)
  const tasks = dependencyResources.map(async dependencyResource => {
    const value = data[dependencyResource.documentID]
    if (!value) {
      return { [dependencyResource.field]: null }
    }    
    if (isString(value)) {
      const dependencyData = await dependence.setDependency(dependencyResource.resource, value, callback)
      return { [dependencyResource.field]: dependencyData }
    }
    if (isStringArray(value)) {
      const dependenciesData = await dependence.setDependencies(dependencyResource.resource, value, callback)
      return { [dependencyResource.field]: dependenciesData }
    }
    return { [dependencyResource.field]: null }
  })  
  const responses = await Promise.all(tasks)
  const results = Object.assign({}, ...responses)
  return [dependence, results]
}

export const getTargetPath = (params: { [key: string]: string }, triggerResource: string, targetResource: string) => {
  const paramaterNames = getDocumentIDs(triggerResource)
  let targetPath = targetResource
  paramaterNames.forEach(name => {
    const pattarn = `{${name}}`
    const reg = new RegExp(pattarn, 'g');
    const value = params[name]
    targetPath = targetPath.replace(reg, value)
  })
  return targetPath
}

const getDocumentIDs = (path: string) => {
  const wildcards = path.match(WILDCARD_REGEX)
  const params: string[] = []
  if (wildcards) {
    wildcards.forEach(wildcard => {
      const wildcardNoBraces = wildcard.slice(1, -1);
      if (wildcardNoBraces) {
        params.push(wildcardNoBraces)
      }
    })
  }
  return params;
}

export const getCollectionIDs = (path: string) => {
  return path.split("/")
    .filter(v => v.length !== 0)
    .filter((_, index) => index % 2 === 0)
}

const isString = (value: unknown): value is string => {
  return typeof value === "string"
}

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && (value.length === 0 || value.every(v => isString(v)))
}

export const groupBy = <K extends PropertyKey, V>(
  array: readonly V[],
  getKey: (cur: V, idx: number, src: readonly V[]) => K
) =>
  array.reduce((obj, cur, idx, src) => {
    const key = getKey(cur, idx, src);
    (obj[key] || (obj[key] = []))!.push(cur);
    return obj;
  }, {} as Partial<Record<K, V[]>>)


export const getPropagateTargets = (queries: JoinQuery[]): Target[] => {
  return queries.map(query => {
    const dependencies = query.resources.map(resource => {
      return {
        field: resource.field,
        resource: `resource.resource/${resource.documentID}`
      }
    })
    return {
      resource: query.to,
      dependencies: dependencies
    } as Target
  })
}