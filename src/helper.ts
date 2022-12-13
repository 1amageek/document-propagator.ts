import { Firestore, Timestamp, DocumentReference } from "firebase-admin/firestore";
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { EventContext } from "firebase-functions/v1";
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
  context: EventContext,
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
      const path = getPathFromResource(context.params, dependencyResource.resource)
      const dependencyData = await dependence.setDependency(path, value, callback)
      return { [dependencyResource.field]: dependencyData }
    }
    if (isStringArray(value)) {
      const path = getPathFromResource(context.params, dependencyResource.resource)
      const dependenciesData = await dependence.setDependencies(path, value, callback)
      return { [dependencyResource.field]: dependenciesData }
    }
    return { [dependencyResource.field]: null }
  })
  const responses = await Promise.all(tasks)
  const results = Object.assign({}, ...responses)
  return [dependence, results]
}

const getPathFromResource = (params: { [key: string]: string }, resource: string) => {
  const paramaterNames = getDocumentIDs(resource)
  let path = resource
  for (const name of paramaterNames) {
    const pattarn = `{${name}}`
    const reg = new RegExp(pattarn, 'g');
    const value = params[name]
    path = path.replace(reg, value)
  }
  return path
}

export const getTargetPath = (params: { [key: string]: string }, triggerResource: string, targetResource: string) => {
  const paramaterNames = getDocumentIDs(triggerResource)
  let targetPath = targetResource
  for (const name of paramaterNames) {
    const pattarn = `{${name}}`
    const reg = new RegExp(pattarn, 'g');
    const value = params[name]
    targetPath = targetPath.replace(reg, value)
  }
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
        resource: `${resource.resource}/${resource.documentID}`
      }
    })
    return {
      resource: query.to,
      dependencies: dependencies
    } as Target
  })
    .filter(v => v.dependencies.length > 0)
}

export const encode = (data: { [key: string]: any }): { [key: string]: any } => {
  const _data = { ...data }
  _replaceTimestamp(_data)
  return _data
}

const _replaceTimestamp = (data: any) => {
  if (isDocumentReference(data)) { return }
  if (data instanceof Function) { return }
  if (data instanceof Object) {
    for (const key in data) {
      const value = data[key]
      if (isTimestamp(value)) {
        data[key] = value.toDate();
      } else {
        _replaceTimestamp(value);
      }
    }
  } else if (data instanceof Array) {
    for (let i = 0; i < data.length; i++) {
      const value = data[i]
      if (isTimestamp(value)) {
        data[i] = value.toDate();
      } else {
        _replaceTimestamp(value);
      }
    }
  }
}

const isTimestamp = (value: any): value is Timestamp => {
  if (typeof value === "object") {
    const object = Object(value)
    return object.hasOwnProperty("_seconds") && object.hasOwnProperty("_nanoseconds")
  }
  return false
}

const isDocumentReference = (value: any): value is DocumentReference => {
  if (typeof value === "object") {
    const object = Object(value)
    return object.hasOwnProperty("_firestore") && object.hasOwnProperty("_path") && object.hasOwnProperty("_converter")
  }
  return false
}