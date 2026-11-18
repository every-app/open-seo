/** Why a search is suggested on the keyword research page. */
export enum KeywordSuggestionReason {
  /** Search Console: the site's best page ranks 4–6. */
  CloseToTopThree = "close_to_top_three",
  /** Search Console: the site's best page ranks on page 2. */
  CloseToPageOne = "close_to_page_one",
  /** The project's saved topics, from website setup or a generation. */
  FromYourSite = "from_your_site",
}
