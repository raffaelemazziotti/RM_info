from scholarly import scholarly
import pandas as pd
import time

delay_seconds = 0.5

# search & pause
search_query = scholarly.search_author('mazziotti raffaele')
first_author_result = next(search_query,None)
time.sleep(delay_seconds)

# fill & pause
author = scholarly.fill(first_author_result)
time.sleep(delay_seconds)

# assemble info
au_info = {
    'name':        author['name'],
    'affiliation': author['affiliation'],
    'citations':   author['citedby'],
    'citations5':  author['citedby5y'],
    'hindex':      author['hindex'],
    'hindex5':     author['hindex5y'],
    'i10index':    author['i10index'],
    'i10index5':   author['i10index5y'],
    'keywords':    ';'.join(author['interests']),
}

# save CSVs without index column
pd.DataFrame(au_info, index=[0]) \
  .to_csv('data/scholar_author_info.csv', index=False)

citationy = author['cites_per_year']
pd.DataFrame(citationy, index=[0]) \
  .to_csv('data/scholar_citations_per_year.csv', index=False)