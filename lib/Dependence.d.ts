import { Firestore } from "firebase-admin/firestore";
import { DocumentReference, DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
export declare const getDependency: <Path extends string, Data>(firestore: Firestore, path: Path, id: string | null, callback: (snapshot: DocumentSnapshot<DocumentData>) => Data) => Promise<[any | null, DocumentReference | null]>;
export declare const getDependencies: <Path extends string, Data>(firestore: Firestore, path: Path, IDs: string[], callback: (snapshot: DocumentSnapshot<DocumentData>) => Data) => Promise<[any[], DocumentReference[]]>;
export declare class Dependence {
    firestore: Firestore;
    dependencies: DocumentReference<DocumentData>[];
    constructor(firestore: Firestore, dependencies?: DocumentReference<DocumentData>[]);
    setDependency<Path extends string, Data>(path: Path, id: string | null, callback: (snapshot: DocumentSnapshot<DocumentData>) => Data): Promise<any>;
    setDependencies<Path extends string, Data>(path: Path, IDs: string[], callback: (snapshot: DocumentSnapshot<DocumentData>) => Data): Promise<any[]>;
}
