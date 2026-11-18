// Page name first: browsers cut long tab titles from the end, so with several
// tabs open a product-first title would make them all look the same.
export function pageHead(pageName: string) {
  return { meta: [{ title: `${pageName} - OpenSEO` }] };
}
