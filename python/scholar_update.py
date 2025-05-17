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

table = results['cited_by']['table']
is_english = 'citations' in table[0]
if is_english:
    cit_key = 'citations'
    h_key = 'h_index'
    i10_key = 'i10_index'
    year_total = 'all'
    year_5y = 'since_2020'
else:
    cit_key = 'citazioni'
    h_key = 'indice_h'
    i10_key = 'i10_index'
    year_total = 'all'
    year_5y = 'dal_2020'

au_info = {
    'name':        profile['name'],
    'affiliation': profile['affiliations'],
    'citations':   results['cited_by']['table'][0][cit_key].get(year_total,-1),
    'citations5':  results['cited_by']['table'][0][cit_key].get(year_5y,-1),
    'hindex':      results['cited_by']['table'][1][h_key].get(year_total,-1),
    'hindex5':     results['cited_by']['table'][1][h_key].get(year_5y,-1),
    'i10index':    results['cited_by']['table'][2][i10_key].get(year_total,-1),
    'i10index5':   results['cited_by']['table'][2][i10_key].get(year_5y,-1),
    'keywords':    ';'.join([inter['title'] for inter in profile['interests'] ]),
}

# save CSVs without index column
pd.DataFrame(au_info, index=[0]) \
    .to_csv('data/scholar_author_info.csv', index=False)

citationy = {year['year']:year['citations'] for year in results['cited_by']['graph']}
pd.DataFrame(citationy, index=[0]) \
    .to_csv('data/citations_per_year.csv', index=False)