import os
from serpapi import GoogleSearch
import pandas as pd

if not os.getenv("GITHUB_ACTIONS"):
    from dotenv import load_dotenv
    load_dotenv()

params = {
  "engine":    "google_scholar_author",
  "author_id": os.getenv("SCHOLAR_USER_ID"),
  "api_key":   os.getenv("SERPAPI_KEY"),
  "hl":        "en",
}
results = GoogleSearch(params).get_dict()
profile = results.get("author", {})

au_info = {
    'name':        profile['name'],
    'affiliation': profile['affiliations'],
    'citations':   results['cited_by']['table'][0]['citations'].get('all',-1),
    'citations5':  results['cited_by']['table'][0]['citations'].get('since_2020',-1),
    'hindex':      results['cited_by']['table'][1]['h_index'].get('all',-1),
    'hindex5':     results['cited_by']['table'][1]['h_index'].get('since_2020',-1),
    'i10index':    results['cited_by']['table'][2]['i10_index'].get('all',-1),
    'i10index5':   results['cited_by']['table'][2]['i10_index'].get('since_2020',-1),
    'keywords':    ';'.join([inter['title'] for inter in profile['interests'] ]),
}

# save CSVs without index column
pd.DataFrame(au_info, index=[0]) \
  .to_csv('data/scholar_author_info.csv', index=False)

citationy = {year['year']:year['citations'] for year in results['cited_by']['graph']}
pd.DataFrame(citationy, index=[0]) \
  .to_csv('data/citations_per_year.csv', index=False)

