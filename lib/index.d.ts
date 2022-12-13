import { RuntimeOptions, SUPPORTED_REGIONS } from "firebase-functions/v1";
import { Field, JoinDependencyResource, JoinQuery, Target } from "./helper";
import { Firestore, DocumentSnapshot, DocumentData } from "firebase-admin/firestore";
/**
 *
 * @param from DocumentReference with wildcards for the original data
 * @param to DocumentReference with wildcards for joind data
 * @param resources Data required for join
 * @returns Returns a joinQuery. This is used by resolve.
 */
export declare const joinQuery: (from: string, to: string, resources: JoinDependencyResource[]) => JoinQuery;
/**
 *
 * @param documentID DocumentID of source data
 * @param field Field name to join to
 * @param resource Path of CollectionReference with wildcards "/users/{userID}"
 */
export declare const depedencyResource: (documentID: string, field: Field, resource: string) => {
    documentID: string;
    field: string;
    resource: string;
};
export declare const resolve: <Data extends {
    [key: string]: any;
}>(firestore: Firestore, options: {
    regions: Array<(typeof SUPPORTED_REGIONS)[number] | string> | null;
    runtimeOptions?: RuntimeOptions;
} | null, queries?: JoinQuery[], callback?: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null) => {
    j: {
        [key: string]: any;
    };
    p: {
        [key: string]: any;
    };
};
/**
 * Triggered when the original data is updated to collect the required data and generate the joined data.
 * @param firestore Firestore for AdminApp
 * @param queries Enter the data required for the trigger path or join.
 * @param callback If you need to process the acquired data, you can change it here.
 * @returns Returns the FunctionBuilder to be deployed.
 */
export declare const join: <Data extends {
    [key: string]: any;
}>(firestore: Firestore, options: {
    regions: Array<(typeof SUPPORTED_REGIONS)[number] | string> | null;
    runtimeOptions?: RuntimeOptions;
} | null, queries?: JoinQuery[], callback?: ((snapshot: DocumentSnapshot<DocumentData>) => Data) | null) => {
    [key: string]: any;
};
/**
 * When the data of the dependent data is updated, the post-merge data is also updated.
 * @param targets
 * @returns Returns the FunctionBuilder to be deployed.
 */
export declare const propagate: (firestore: Firestore, options: {
    regions: Array<(typeof SUPPORTED_REGIONS)[number] | string> | null;
    runtimeOptions?: RuntimeOptions;
} | null, targets: Target[]) => {
    [key: string]: any;
};
