import { Firestore, Timestamp, DocumentReference } from "firebase-admin/firestore";
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { Dependence } from "./Dependence";
import { Context, Data, Field } from "./Interface";
import { ParamsOf } from "firebase-functions/v2";

const WILDCARD_REGEX = new RegExp('{[^/{}]*}', 'g')

export type Target = {
  from: string
  to: string
  dependencies: DependencyResource[]
  group: PathGroup | null
}

export type JoinQuery = {
  from: string
  to: string
  resources: JoinDependencyResource[]
  group?: PathGroup | undefined
}

export type PathGroup = {
  documentID: string
  values: string[]
}

export type JoinDependencyResource = {
  documentID: string
  field: Field
  resource: string
}

export type DependencyResource = {
  from: string
  to: string
  field: Field
  resource: string
  documentID: string
  group: PathGroup | null
}

export type TargetResource = {
  field: Field
  resource: string
}

export const replaceDependencyData = async <Document extends string>(
  firestore: Firestore,
  context: Context<Document>,
  dependencyResources: JoinDependencyResource[],
  data: Data,
  callback: (context: Context<Document>, snapshot: DocumentSnapshot<DocumentData>) => Data
): Promise<[Dependence, { [x: string]: any }[]]> => {
  const _context = context.event
  const dependence = new Dependence(firestore)
  const tasks = dependencyResources.map(async dependencyResource => {
    const value = data[dependencyResource.documentID]
    if (!value) {
      return { [dependencyResource.field]: null }
    }
    if (isString(value)) {
      const path = getPathFromResource(_context.params, dependencyResource.resource) as Document
      const dependencyData = await dependence.setDependency(path, value, context, callback)
      return { [dependencyResource.field]: dependencyData }
    }
    if (isStringArray(value)) {
      const path = getPathFromResource(_context.params, dependencyResource.resource) as Document
      const dependenciesData = await dependence.setDependencies(path, value, context, callback)
      return { [dependencyResource.field]: dependenciesData }
    }
    return { [dependencyResource.field]: null }
  })
  const responses = await Promise.all(tasks)
  const results = Object.assign({}, ...responses)
  return [dependence, results]
}

export const getPath = (resource: string, params: { [key: string]: string }) => {
  const paramaterNames = getDocumentIDs(resource)
  let path = resource
  for (const name of paramaterNames) {
    const pattarn = `{${name}}`
    const reg = new RegExp(pattarn, 'g')
    const value = params[name]
    if (value !== undefined) {
      path = path.replace(reg, value)
    }
  }
  return path
}

export const getParams = (path: string, format: string): { [key: string]: string } => {
  const pattern = format.replace(/\{([^}]+)\}/g, '([^/]+)');
  const reg = new RegExp(pattern);
  const match = path.match(reg);
  if (!match) {
    return {};
  }
  const formatMatch = format.match(/\{([^}]+)\}/g);
  if (!formatMatch) {
    return {};
  }
  const paramNames = formatMatch.map(name => name.substring(1, name.length - 1));
  const params: { [key: string]: string } = {};
  for (let i = 0; i < paramNames.length; i++) {
    params[paramNames[i]] = match[i + 1];
  }
  return params;
}

export const getPathFromResource = (params: { [key: string]: string }, resource: string) => {
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

export const getTargetPath = <Document extends string>(params: ParamsOf<Document>, triggerResource: string, targetResource: string) => {
  const parameterNames = getDocumentIDs(triggerResource)
  let targetPath = targetResource
  for (const name of parameterNames) {
    const pattern = `{${name}}`
    const reg = new RegExp(pattern, 'g');
    const value = (params as Record<string, string>)[name]
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
  return queries.flatMap(query => {
    const dependencies: DependencyResource[] = query.resources.map(resource => {
      return {
        from: query.from,
        to: query.to,
        field: resource.field,
        documentID: resource.documentID,
        resource: `${resource.resource}/{${resource.documentID}}`,
        group: query.group ?? null
      }
    })
    return [{
      from: query.from,
      to: query.to,
      dependencies: dependencies,
      group: query.group ?? null
    } as Target]
  })
    .filter(v => v.dependencies.length > 0)
}

export const encode = (data: Data): Data => {
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