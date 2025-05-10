from db_lib import *
import time
import numpy as np
import pandas as pd
import time
import json
from pathlib import Path

# script to create or update the scopus data

me = '57110486800'
scopus = ScopusAPI()

auth_info = scopus.get_author(me)
with open("data/scopus_author_info.json", "w", encoding="utf-8") as f:
    json.dump(auth_info, f, ensure_ascii=False, indent=2)

db = ScopusDB('data/scopus.db')
db.create_tables()
db.connect()

# Download all the articles of the author
articles =  scopus.get_all_articles(me)

# Update article database
print('Update articles...')
print('Article N:', end=' ')
for i,article in enumerate(articles):
    print(i,end=' ')
    db.insert_or_update_article(article)

# Update journals
print('Update journals...')
articles = db.get_all_articles()

journals = [article['journal'] if type(article['journal'])==str else article['journal']['id'] for article in articles]
for i,jid in enumerate(journals):
    if not (db.record_exists('journals', jid)):
        journal = scopus.get_journal_info(jid)
        if journal:
            db.insert_journal(journal)
        else:
            print(f"Journal {jid} roll back to default info")
            aid = articles[i]['id']
            article_raw = scopus.get_article(aid)
            journal = dict()
            journal['id'] = jid
            journal['title'] = article_raw['abstracts-retrieval-response']['coredata'].get('prism:publicationName','N/A')
            journal['publisher'] = article_raw['abstracts-retrieval-response']['coredata'].get('dc:publisher','N/A')
            journal['aggregationType'] = article_raw['abstracts-retrieval-response']['coredata'].get('prism:aggregationType','N/A')

            journal['subjects'] = [
                subject.get('$', 'N/A') for subject in article_raw['abstracts-retrieval-response']['subject-areas']['subject-area']
            ]
            db.insert_journal(journal)
        time.sleep(1)
    else:
        print(f"journal {jid} already exists")

# Update authors
print('Update authors...')
authors = [str(aid) for aid in np.unique([ids['id'] if type(ids)==dict else ids for article in articles for ids in article['authors']])]

for author in authors:
    if not (db.record_exists('authors', author)):
        author_raw = scopus.get_author(author)
        db.insert_author(author_raw)
        time.sleep(0.5)

# Update affiliations
print('Update affiliations...')
affiliations = [str(aid) for aid in np.unique([ids['id'] if type(ids)==dict else ids  for article in articles for ids in article['affiliations']])]

for affiliation in affiliations:
    if affiliation and not (db.record_exists('affiliations', affiliation)):
        affiliation_raw = scopus.get_affiliation(affiliation)
        db.insert_affiliation(affiliation_raw)

# refresh the home-pubs file

query = """
    SELECT
  substr(a.year,1,4)           AS year,
  a.title                      AS title,
  GROUP_CONCAT(au.auth, ', ')  AS authors,
  j.title                      AS journal,
  a.doi                        AS doi
FROM articles AS a
-- split the “1|2|3” string into rows via JSON
JOIN json_each(
     '["'
     || replace(a.authors, '|', '","')
     || '"]'
   ) AS split_ids
  ON TRUE
-- map each split ID back to the authors table
JOIN authors AS au
  ON au.id = split_ids.value
LEFT JOIN journals AS j
  ON j.id = a.journal_id
GROUP BY a.id
ORDER BY year DESC,  -- most recent year first
         a.citations DESC  -- tie-break by citation count
LIMIT 3;
"""
rows = db.execute_query(query)
data = list()
for row in rows:
    data.append( dict(row) )

output = { 'homePubs': data }


# write to JSON file
# TODO change the path to sections
out_path = Path('sections\\home_pubs.json')
with out_path.open('w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)



