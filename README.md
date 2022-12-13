# document-propagator.ts

Cloud Firestore does not have Join Query. However, there are many use cases that require data joins.
This library is designed to resolve CloudFirestore's Document dependencies.


## Usage

The following code shows the Shop, Product, and Catalog dependencies of an EC. 


![スクリーンショット 2022-12-13 22 02 10](https://user-images.githubusercontent.com/11146538/207325209-addc3388-1426-46f3-a22e-ec5fafd55a9f.png)

Catalog depends on Product and Shop.
Product depends on SKU.

![スクリーンショット 2022-12-13 22 02 15](https://user-images.githubusercontent.com/11146538/207325197-4932f0e3-4c50-4c7b-88a7-3201394aabc7.png)


```typescript
export const dependency = propagator.resolve(getFirestore(app),
  { regions: ["asia-northeast1"] },
  [
    {
      from: "/EC/{version}/shopDrafts/{shopID}",
      to: "/EC/{version}/shops/{shopID}",
      resources: [],
    },
    {
      from: "/EC/{version}/shops/{shopID}/productDrafts/{productID}",
      to: "/EC/{version}/shops/{shopID}/products/{productID}",
      resources: [
        { documentID: "SKUIDs", field: "skus", resource: "/EC/{version}/shops/{shopID}/products/{productID}/SKUs/{skuID}" },
      ],
    },
    {
      from: "/EC/{version}/shops/{shopID}/products/{productID}/SKUDrafts/{skuID}",
      to: "/EC/{version}/shops/{shopID}/products/{productID}/SKUs/{skuID}",
      resources: [],
    },
    {
      from: "/EC/{version}/shops/{shopID}/catalogDrafts/{catalogID}",
      to: "/EC/{version}/shops/{shopID}/catalog/{catalogID}",
      resources: [
        { documentID: "shopID", field: "shop", resource: "/EC/{version}/shops" },
        { documentID: "productIDs", field: "products", resource: "/EC/{version}/shop/{shopID}/products" },
      ],
    },
  ]
)
```

When the Draft is updated, Cloud Functions is triggered to retrieve the dependent data and merge the data. After the merged data is updated, the update is propagated to the data with dependencies.
