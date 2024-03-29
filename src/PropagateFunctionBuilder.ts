import { Firestore, CollectionReference, DocumentReference, Timestamp } from "firebase-admin/firestore"
import { CloudFunction, ParamsOf, logger } from "firebase-functions/v2"
import { onDocumentWritten, DocumentOptions, Change, FirestoreEvent, DocumentSnapshot } from "firebase-functions/v2/firestore"
import { DependencyResource, getPathFromResource, getTargetPath, encode, getParams, getPath } from "./helper"
import { v4 as uuidv4 } from 'uuid'
import { Field, Data } from "./Interface"
import * as jsondiffpatch from "jsondiffpatch"

type DependencyTarget = {
  from: string
  to: string
  documentID: string
  reference: CollectionReference
  field: Field
}

export class PropagateFunctionBuilder {

  firestore: Firestore

  constructor(firestore: Firestore) {
    this.firestore = firestore
  }

  build<Document extends string>(
    options: Partial<DocumentOptions> | null,
    triggerResource: Document,
    dependencyTargetResources: DependencyResource[],
    snapshotHandler: ((before: DocumentSnapshot, after: DocumentSnapshot) => boolean) | null = null,
    callback: ((before: DocumentSnapshot, after: DocumentSnapshot) => Data),
  ): CloudFunction<FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>> {
    const _options: DocumentOptions<Document> = { ...options, document: triggerResource }
    return onDocumentWritten<Document>(_options, (event) => {
      const params = event.params
      const change = event.data!
      const dependencyTargets: DependencyTarget[] = dependencyTargetResources.flatMap(target => {
        const paths = target.resource.split("/")
        const resource = paths.slice(0, paths.length - 1).join("/")
        const group = target.group
        if (!group) {
          const targetPath = getTargetPath(params, triggerResource, resource)
          return [{ reference: this.firestore.collection(targetPath), field: target.field, from: target.from, to: target.to, documentID: target.documentID }]
        }
        return group.values.map(value => {
          const resourcePath = getTargetPath({ ...params }, triggerResource, resource)
          const targetPath = getPathFromResource({ [group.documentID]: value }, resourcePath)
          return { reference: this.firestore.collection(targetPath), field: target.field, from: target.from, to: target.to, documentID: target.documentID }
        })
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
  hander: ((before: DocumentSnapshot, after: DocumentSnapshot) => boolean) | null = null,
  callback: ((before: DocumentSnapshot, after: DocumentSnapshot) => Data)
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
  return await resolve(firestore, dependencyTargets, ref, data)
}

const onDelete = async (
  firestore: Firestore,
  dependencyTargets: DependencyTarget[],
  snapshot: DocumentSnapshot,
) => {
  return await resolve(firestore, dependencyTargets, snapshot.ref, null)
}

/**
* Resolve dependencies
* @param dependencyTargets Dependecy Target CollecitonReference
* @param reference DocumentReference
* @param documentData DocumentData
*/
const resolve = async (firestore: Firestore, dependencyTargets: DependencyTarget[], reference: DocumentReference, documentData: any | null) => {
  const uniqueTargets = dependencyTargets.filter((obj, index, self) =>
    index === self.findIndex((o) =>
      o.field === obj.field &&
      o.from === obj.from &&
      o.to === obj.to &&
      o.documentID === obj.documentID &&
      o.reference.path === obj.reference.path
    )
  )
  const getData = async (target: DependencyTarget) => {
    const _reference = firestore.doc(reference.path)
    const snapshot = await target.reference.where("__dependencies", "array-contains", _reference).get()
    return {
      snapshot: snapshot,
      field: target.field,
      from: target.from,
      to: target.to,
      documentID: target.documentID,
      reference: target.reference
    }
  }

  if (documentData) {
    const propageteID = documentData["__propageteID"] ?? uuidv4()
    const updateDocumentData = { ...documentData, id: reference.id }

    for (const uniqueTarget of uniqueTargets) {
      const target = await getData(uniqueTarget)
      const documents = target.snapshot.docs
      const field = target.field
      for (const doc of documents) {
        logger.log(`[Propagate][onUpdate] from:${reference.path} to:${doc.ref.path}`)
        firestore.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(doc.ref)
          const data = snapshot.data()
          if (data) {
            const fieldData = data[field]
            if (Array.isArray(fieldData)) {
              const index = fieldData.findIndex((data) => data.id === reference.id)
              if (index !== -1) {
                if (isChanged(fieldData[index], updateDocumentData)) {
                  fieldData[index] = clean(updateDocumentData)
                  transaction.update(doc.ref, {
                    [field]: fieldData,
                    "__propageteID": propageteID
                  })
                }
              }
            } else {
              if (isChanged(fieldData, updateDocumentData)) {
                const updateDate = clean(updateDocumentData)
                transaction.update(doc.ref, {
                  [field]: updateDate,
                  "__propageteID": propageteID
                })
              }
            }
          }
        })
      }
    }
  } else {
    for (const uniqueTarget of uniqueTargets) {
      const target = await getData(uniqueTarget)
      const documents = target.snapshot.docs
      const field = target.documentID
      for (const doc of documents) {
        logger.log(`[Propagate][onDelete] from:${reference.path} to:${doc.ref.path}`)
        const params = getParams(doc.ref.path, target.to)
        const path = getPath(target.from, params)
        const ref = firestore.doc(path)
        firestore.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref)
          if (snapshot.exists) {
            const data = clean(doc.data())
            const id = reference.id
            const fieldData = data[field]
            if (Array.isArray(fieldData)) {
              const index = fieldData.findIndex((data) => data === id)
              if (index !== -1) {
                const updateDocumentData = fieldData.filter((data) => data !== id)
                transaction.update(ref, { [field]: updateDocumentData })
              }
            } else {
              transaction.update(ref, { [field]: null })
            }
          }
        })
      }
    }
  }
}

function isChanged(before: any, after: any) {
  function _clean(data: any) {
    const _data = { ...data }
    _removeProperties(_data)
    return _data
  }
  function _removeProperties(data: any) {
    if (data instanceof Object && !(data instanceof Function) && !(data instanceof DocumentReference)) {
      for (const key in data) {
        const value = data[key]
        if (
          key == "__dependencies" ||
          key == "__UUID" ||
          key == "__propageteID" ||
          key == "createTime" ||
          key == "updateTime"
        ) {
          delete data[key]
        } else {
          _removeProperties(value)
        }
      }
    }
  }
  const _before = _clean(before)
  const _after = _clean(after)
  return jsondiffpatch.diff(_before, _after) !== undefined
}

function clean(data: any) {
  const _data = { ...data }
  removeProperties(_data)
  replaceTimestamp(_data)
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

function replaceTimestamp(data: any) {
  if (data instanceof Object && !(data instanceof Function) && !(data instanceof DocumentReference)) {
    for (const key in data) {
      const value = data[key]
      if (value instanceof Timestamp) {
        data[key] = value.toDate()
      } else if (Array.isArray(value) && value.length === 2) {
        if (value[0] instanceof Timestamp && value[1] instanceof Timestamp) {
          data[key] = [value[0].toDate(), value[1].toDate()]
        }
      }
      replaceTimestamp(value)
    }
  }
}