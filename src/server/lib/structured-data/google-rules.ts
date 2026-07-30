/**
 * Google rich-result requirements, transcribed from Search Central.
 *
 * Deliberately small (spec 0012). Google moves eligibility around — FAQ and
 * HowTo both stopped producing rich results — so a sprawling table would be a
 * confident source of wrong answers. Nine features are covered; a type with no
 * entry is reported as "no eligibility rules", never as passing. Each entry
 * carries the date its requirements were last read off the docs so drift is
 * visible in the diff rather than invisible in production.
 *
 * Where Google's wording is conditional, the rules under-report rather than
 * risk a false error: `requiredWhenPresent` fires only once the parent
 * property exists, and a dotted requirement whose parent is missing is left to
 * the parent's own finding.
 */

export type RequiredWhenPresent = {
  /** Property that triggers the check. */
  path: string;
  /** At least one of these must resolve on it (relative paths). */
  oneOf: readonly string[];
};

export type RichResultRule = {
  /** Matched against a node's type and its supertypes; nearest rule wins. */
  type: string;
  feature: string;
  /** Dotted paths allowed. A missing parent suppresses the child's finding. */
  required: readonly string[];
  /** Each group needs at least one member present. */
  requiredOneOf?: readonly (readonly string[])[];
  requiredWhenPresent?: readonly RequiredWhenPresent[];
  /** Reported as one aggregated warning, never one warning per property. */
  recommended: readonly string[];
  docsUrl: string;
  checkedOn: string;
};

const CHECKED_ON = "2026-07-30";

export const RICH_RESULT_RULES: readonly RichResultRule[] = [
  {
    type: "Article",
    feature: "Article",
    // Google: "There are no required properties; instead, add the properties
    // that apply to your content."
    required: [],
    recommended: [
      "author",
      "author.name",
      "author.url",
      "dateModified",
      "datePublished",
      "headline",
      "image",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/article",
    checkedOn: CHECKED_ON,
  },
  {
    type: "BreadcrumbList",
    feature: "Breadcrumb",
    required: ["itemListElement"],
    recommended: [],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/breadcrumb",
    checkedOn: CHECKED_ON,
  },
  {
    type: "Product",
    feature: "Product snippet",
    required: ["name"],
    requiredOneOf: [["review", "aggregateRating", "offers"]],
    // Covers Offer (`price`, or a price inside priceSpecification) and
    // AggregateOffer (`lowPrice`) in one entry.
    requiredWhenPresent: [
      {
        path: "offers",
        oneOf: ["price", "priceSpecification.price", "lowPrice"],
      },
    ],
    recommended: [
      "aggregateRating",
      "offers",
      "review",
      "offers.availability",
      "offers.priceCurrency",
      "offers.priceValidUntil",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/product-snippet",
    checkedOn: CHECKED_ON,
  },
  {
    type: "Recipe",
    feature: "Recipe",
    required: ["image", "name"],
    recommended: [
      "aggregateRating",
      "author",
      "cookTime",
      "datePublished",
      "description",
      "keywords",
      "nutrition.calories",
      "prepTime",
      "recipeCategory",
      "recipeCuisine",
      "recipeIngredient",
      "recipeInstructions",
      "recipeYield",
      "totalTime",
      "video",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/recipe",
    checkedOn: CHECKED_ON,
  },
  {
    type: "Event",
    feature: "Event",
    required: ["name", "startDate", "location", "location.address"],
    recommended: [
      "description",
      "endDate",
      "eventStatus",
      "image",
      "location.name",
      "offers",
      "offers.availability",
      "offers.price",
      "offers.priceCurrency",
      "offers.url",
      "offers.validFrom",
      "organizer",
      "performer",
      "previousStartDate",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/event",
    checkedOn: CHECKED_ON,
  },
  {
    type: "JobPosting",
    feature: "Job posting",
    required: [
      "datePosted",
      "description",
      "hiringOrganization",
      "jobLocation",
      "title",
    ],
    recommended: [
      "applicantLocationRequirements",
      "baseSalary",
      "directApply",
      "employmentType",
      "identifier",
      "jobLocationType",
      "validThrough",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/job-posting",
    checkedOn: CHECKED_ON,
  },
  {
    type: "LocalBusiness",
    feature: "Local business",
    required: ["address", "name"],
    recommended: [
      "aggregateRating",
      "geo.latitude",
      "geo.longitude",
      "openingHoursSpecification",
      "priceRange",
      "review",
      "telephone",
      "url",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/local-business",
    checkedOn: CHECKED_ON,
  },
  {
    type: "VideoObject",
    feature: "Video",
    required: ["name", "thumbnailUrl", "uploadDate"],
    recommended: [
      "contentUrl",
      "description",
      "duration",
      "embedUrl",
      "expires",
      "interactionStatistic",
      "regionsAllowed",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/video",
    checkedOn: CHECKED_ON,
  },
  {
    type: "Organization",
    feature: "Organization",
    // Google: "there are no required properties; instead, add the properties
    // that apply to your organization."
    required: [],
    recommended: [
      "address",
      "contactPoint",
      "description",
      "logo",
      "name",
      "sameAs",
      "telephone",
      "url",
    ],
    docsUrl:
      "https://developers.google.com/search/docs/appearance/structured-data/organization",
    checkedOn: CHECKED_ON,
  },
];

/** Features Google stopped showing. The markup stays valid Schema.org, so this
 *  is reported as info — the point is to stop people maintaining it for a
 *  rich result that no longer exists. */
type RetiredFeature = {
  type: string;
  feature: string;
  retiredOn: string;
  note: string;
};

export const RETIRED_FEATURES: readonly RetiredFeature[] = [
  {
    type: "FAQPage",
    feature: "FAQ",
    retiredOn: "2026-05",
    note: "Google stopped showing FAQ rich results in May 2026 and withdrew the documentation. The markup is still valid Schema.org and still readable by other consumers, but it will not produce a rich result.",
  },
  {
    type: "HowTo",
    feature: "How-to",
    retiredOn: "2023-08",
    note: "Google retired How-to rich results in August 2023. The markup is still valid Schema.org, but it will not produce a rich result.",
  },
];
