import { Firestore } from "firebase-admin/firestore"
import { DocumentReference, DocumentData, DocumentSnapshot } from "firebase-admin/firestore"
import { Context } from "./Interface"

export const getDependency = async <Document extends string, Data>(
  firestore: Firestore,
  path: Document,
  id: string | null,
  context: Context<Document>,
  callback: (context: Context<Document>, snapshot: DocumentSnapshot<DocumentData>) => Data
): Promise<[any | null, DocumentReference | null]> => {
  if (!id) {
    return [null, null]
  }
  const ref = firestore.doc(`${path}/${id}`)
  const snapshot = await ref.get()
  const data = callback(context, snapshot) ?? null
  const newData = clean(data)
  return [newData, ref]
}

export const getDependencies = async <Document extends string, Data>(
  firestore: Firestore,
  path: Document,
  IDs: string[],
  context: Context<Document>,
  callback: (context: Context<Document>, snapshot: DocumentSnapshot<DocumentData>) => Data
): Promise<[any[], DocumentReference[]]> => {
  if (IDs.length === 0) {
    return [[], []]
  }
  const refs = IDs.map((id) => {
    return firestore.doc(`${path}/${id}`)
  })
  const tasks = refs.map((ref) => {
    return ref.get()
  })
  const snapshots = await Promise.all(tasks)
  const docs = snapshots
    .flatMap((snapshot) => {
      if (snapshot.exists) {   
        const data = callback(context, snapshot) ?? null
        if (data) {
          return clean(data)
        } else {
          return null
        }
      }
      return null
    })
    .filter((doc) => !!doc)
  return [docs, refs]
}

export class Dependence {

  firestore: Firestore

  dependencies: DocumentReference<DocumentData>[]

  constructor(firestore: Firestore, dependencies: DocumentReference<DocumentData>[] = []) {
    this.firestore = firestore
    this.dependencies = dependencies
  }

  async setDependency<Document extends string, Data>(
    path: Document,
    id: string | null,
    context: Context<Document>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot<DocumentData>) => Data
  ) {
    const [data, ref] = await getDependency(this.firestore, path, id, context, callback)
    if (ref) {
      this.dependencies.push(ref)
    }
    return data
  }

  async setDependencies<Document extends string, Data>(
    path: Document,
    IDs: string[],
    context: Context<Document>,
    callback: (context: Context<Document>, snapshot: DocumentSnapshot<DocumentData>) => Data
    ) {
    const [data, refs] = await getDependencies(this.firestore, path, IDs, context, callback)
    refs.forEach((ref) => {
      this.dependencies.push(ref)
    })
    return data
  }
}


function clean(data: any) {
  const _data = { ...data }
  removeProperties(_data)
  return _data
}

function removeProperties(data: any) {
  if (data instanceof Object && !(data instanceof Function) && !(data instanceof DocumentReference)) {
    for (const key in data) {
      const value = data[key]
      if (
        key == "__dependencies" ||
        key == "__UUID" ||
        key == "__propageteID"
      ) {
        delete data[key]
      } else {
        removeProperties(value)
      }
    }
  }
}