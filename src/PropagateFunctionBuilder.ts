import { Firestore, DocumentSnapshot, DocumentReference, CollectionReference, DocumentData } from "firebase-admin/firestore"
import * as functions from "firebase-functions/v1"
import { logger } from "firebase-functions/v2"
import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1"
import { DependencyResource, Field, getTargetPath, encode, Data } from "./helper"
import { v4 as uuidv4 } from 'uuid'

type DependencyTarget = {
  reference: CollectionReference
  field: Field
}

export class PropagateFunctionBuilder {

  firestore: Firestore

  constructor(firestore: Firestore) {
    this.firestore = firestore
  }

  build(
    options: {
      regions: Array<typeof SUPPORTED_REGIONS[number] | string> | null,
      runtimeOptions?: RuntimeOptions
    } | null,
    triggerResource: string,
    dependencyTargetResources: DependencyResource[],
    snapshotHandler: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => boolean) | null = null,
    callback: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => Data),
  ): functions.CloudFunction<functions.Change<functions.firestore.DocumentSnapshot>> {
    let builder = options?.regions != null ? functions.region(...options.regions) : functions
    builder = !!options?.runtimeOptions ? builder.runWith(options.runtimeOptions) : builder
    return builder
      .firestore
      .document(triggerResource)
      .onWrite((change, context) => {
        const dependencyTargets: DependencyTarget[] = dependencyTargetResources.map(target => {
          const resource = target.resource.split("/").slice(1, -1).join("/")
          const targetPath = getTargetPath(context.params, triggerResource, resource)
          return { reference: this.firestore.collection(targetPath), field: target.field }
        })
        if (change.before.exists) {
          if (change.after.exists) {
            return onUpdate(this.firestore, dependencyTargets, change.before, change.after, snapshotHandler, callback)
          } else {
            return onDelete(this.firestore, dependencyTargets, change.before)
          }
        }
        return null
      })
  }
}

const onUpdate = async (
  firestore: Firestore,
  dependencyTargets: DependencyTarget[],
  before: DocumentSnapshot,
  after: DocumentSnapshot,
  hander: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => boolean) | null = null,
  callback: ((before: DocumentSnapshot<DocumentData>, after: DocumentSnapshot<DocumentData>) => Data)
) => {
  if (hander !== null) {
    const execute = hander(before, after)
    if (!execute) {
      return
    }
  }
  const _data = callback(before, after)
  const data = encode(_data)
  const ref = after.ref
  logger.log(`[Propagate][onUpdate]${ref.path}`)
  return await resolve(firestore, dependencyTargets, ref, data)
}

const onDelete = async (
  firestore: Firestore,
  dependencyTargets: DependencyTarget[],
  snapshot: DocumentSnapshot,
) => {
  logger.log(`[Propagate][onDelete]${snapshot.ref.path}`)
  return await resolve(firestore, dependencyTargets, snapshot.ref, null)
}

/**
* Resolve dependencies
* @param dependencyTargets Dependecy Target CollecitonReference
* @param reference DocumentReference
* @param documentData DocumentData
*/
const resolve = async (firestore: Firestore, dependencyTargets: DependencyTarget[], reference: DocumentReference, documentData: any | null) => {
  const tasks = dependencyTargets.map(async (target) => {
    const _reference = firestore.doc(reference.path)
    const snapshot = await target.reference.where("__dependencies", "array-contains", _reference).get()
    return {
      snapshot: snapshot,
      field: target.field
    }
  })
  const targets = await Promise.all(tasks)
  const bulkWriter = firestore.bulkWriter()
  // If data exists, update it.
  if (documentData) {
    const propageteID = documentData["__propageteID"] ?? uuidv4()
    const updateDocumentData = { ...documentData, id: reference.id }
    for (const target of targets) {
      const documents = target.snapshot.docs
      const field = target.field
      for (const doc of documents) {
        const data = doc.data()
        const fieldData = data[field]
        if (Array.isArray(fieldData)) {
          const index = fieldData.findIndex((data) => data.id === reference.id)
          if (index !== -1) {
            fieldData[index] = updateDocumentData
            bulkWriter.update(doc.ref, {
              [field]: fieldData,
              "__propageteID": propageteID
            })
          }
        } else {
          bulkWriter.update(doc.ref, {
            [field]: updateDocumentData,
            "__propageteID": propageteID
          })
        }
      }
    }
  }
  // If data does not exist, delete
  else {
    for (const target of targets) {
      const documents = target.snapshot.docs
      const field = target.field
      for (const doc of documents) {
        const data = doc.data()
        const fieldData = data[field]
        if (Array.isArray(fieldData)) {
          const index = fieldData.findIndex((data) => data.id === reference.id)
          if (index !== -1) {
            const newFieldData = [...fieldData]
            newFieldData.slice(index, 1)
            bulkWriter.update(doc.ref, {
              [field]: newFieldData,
            })
          }
        }
      }
    }
  }
  return await bulkWriter.close()
}
