
delay_seconds = 0.5
search_query = scholarly.search_author('Raffaele M Mazziotti')
print("Scholar search query object:", search_query)
first_author_result = next(search_query)

# Retrieve all the details for the author
author = scholarly.fill(first_author_result)
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
pd.DataFrame(au_info, index=[0]) \
  .to_csv('data/scholar_author_info.csv', index=False)

citationy = author['cites_per_year']
pd.DataFrame(citationy, index=[0]) \
  .to_csv('data/scholar_citations_per_year.csv', index=False)

print("Scholar data fetched and saved successfully.")
