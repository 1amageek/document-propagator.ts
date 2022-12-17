import { Firestore } from "firebase-admin/firestore";
import { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import { EventContext } from "firebase-functions/v1";
import { Dependence } from "./Dependence";
export type CollectionReferenceResource = string;
export type DocumentReferencePath = string;
export type Field = string;
export type Target = {
    resource: string;
    dependencies: DependencyResource[];
};
export type JoinQuery = {
    from: string;
    to: string;
    resources: JoinDependencyResource[];
};
export type JoinDependencyResource = {
    documentID: string;
    field: Field;
    resource: string;
};
export type DependencyResource = {
    field: Field;
    resource: string;
};
export type TargetResource = {
    field: Field;
    resource: string;
};
export declare const replaceDependencyData: <Data>(firestore: Firestore, context: EventContext, dependencyResources: JoinDependencyResource[], data: DocumentData, callback: (snapshot: DocumentSnapshot<DocumentData>) => Data) => Promise<[Dependence, {
    [x: string]: any;
}[]]>;
export declare const getTargetPath: (params: {
    [key: string]: string;
}, triggerResource: string, targetResource: string) => string;
export declare const getCollectionIDs: (path: string) => string[];
export declare const groupBy: <K extends PropertyKey, V>(array: readonly V[], getKey: (cur: V, idx: number, src: readonly V[]) => K) => Partial<Record<K, V[]>>;
export declare const getPropagateTargets: (queries: JoinQuery[]) => Target[];
export declare const encode: (data: {
    [key: string]: any;
}) => {
    [key: string]: any;
};
