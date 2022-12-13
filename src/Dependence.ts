import { Firestore } from "firebase-admin/firestore"
import { DocumentReference, DocumentData, DocumentSnapshot } from "firebase-admin/firestore"

export const getDependency = async <Path extends string, Data>(
  firestore: Firestore,
  path: Path,
  id: string | null,
  callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
): Promise<[any | null, DocumentReference | null]> => {
  if (!id) {
    return [null, null]
  }
  const ref = firestore.doc(`${path}/${id}`)
  const snapshot = await ref.get()
  const data = callback(snapshot) ?? null
  return [data, ref]
}

export const getDependencies = async <Path extends string, Data>(
  firestore: Firestore,
  path: Path,
  IDs: string[],
  callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
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
        return callback(snapshot) ?? null
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

  async setDependency<Path extends string, Data>(
    path: Path,
    id: string | null,
    callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
  ) {
    const [data, ref] = await getDependency(this.firestore, path, id, callback)
    if (ref) {
      this.dependencies.push(ref)
    }
    return data
  }

  async setDependencies<Path extends string, Data>(
    path: Path,
    IDs: string[],
    callback: (snapshot: DocumentSnapshot<DocumentData>) => Data
    ) {
    const [data, refs] = await getDependencies(this.firestore, path, IDs, callback)
    refs.forEach((ref) => {
      this.dependencies.push(ref)
    })
    return data
  }
}
