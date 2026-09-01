from db_lib import *
import time
import json

from pathlib import Path
from datetime import datetime


# Script to create or update the Scopus data

ME = "57110486800"

scopus = ScopusAPI()


# ---------------------------------------------------------------------
# Update main author information
# ---------------------------------------------------------------------

auth_info = scopus.get_author(ME)

with open("data/scopus_author_info.json", "w", encoding="utf-8") as f:
    json.dump(auth_info, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------
# Initialize database
# ---------------------------------------------------------------------

db = ScopusDB("data/scopus.db")
db.create_tables()
db.connect()


# ---------------------------------------------------------------------
# Download all articles
# ---------------------------------------------------------------------

articles = scopus.get_all_articles(ME)


# ---------------------------------------------------------------------
# Extract affiliation IDs
# ---------------------------------------------------------------------

affiliations = sorted({
    str(affiliation_id)
    for article in articles
    for affiliation in (
        article.get("affiliation")
        or article.get("affiliations")
        or []
    )
    for affiliation_id in [
        affiliation.get("id")
        if isinstance(affiliation, dict)
        else affiliation
    ]
    if affiliation_id is not None
})


# ---------------------------------------------------------------------
# Update articles
# ---------------------------------------------------------------------

print("Update articles...")
print("Article N:", end=" ")

for i, article in enumerate(articles):
    print(i, end=" ")
    db.insert_or_update_article(article)

print()


# ---------------------------------------------------------------------
# Update authors
# ---------------------------------------------------------------------

print("Update authors...")

authors = sorted({
    str(author_id)
    for article in articles
    for author in article.get("authors_id", [])
    for author_id in [
        author.get("id")
        if isinstance(author, dict)
        else author
    ]
    if author_id is not None
})


for author in authors:

    author_raw = scopus.get_author(author)

    # Scopus may return None for obsolete, merged, or unavailable authors.
    # Do not stop the entire database update for one missing author.
    if author_raw is None:
        print(
            f"Skipping author {author}: "
            f"no information returned by Scopus"
        )
        continue

    db.insert_or_update_author(author_raw)

    # Avoid making requests too quickly.
    time.sleep(0.5)


# ---------------------------------------------------------------------
# Update journals
# ---------------------------------------------------------------------

print("Update journals...")

articles = db.get_all_articles()

journals = [
    article["journal"]
    if isinstance(article["journal"], str)
    else article["journal"]["id"]
    for article in articles
]


for i, jid in enumerate(journals):

    if not db.record_exists("journals", jid):

        journal = scopus.get_journal_info(jid)

        if journal:

            db.insert_journal(journal)

        else:

            print(f"Journal {jid} roll back to default info")

            aid = articles[i]["id"]
            article_raw = scopus.get_article(aid)

            journal = {
                "id": jid,
                "title": article_raw[
                    "abstracts-retrieval-response"
                ]["coredata"].get(
                    "prism:publicationName",
                    "N/A"
                ),
                "publisher": article_raw[
                    "abstracts-retrieval-response"
                ]["coredata"].get(
                    "dc:publisher",
                    "N/A"
                ),
                "aggregationType": article_raw[
                    "abstracts-retrieval-response"
                ]["coredata"].get(
                    "prism:aggregationType",
                    "N/A"
                ),
                "subjects": [
                    subject.get("$", "N/A")
                    for subject in article_raw[
                        "abstracts-retrieval-response"
                    ]["subject-areas"]["subject-area"]
                ],
            }

            db.insert_journal(journal)

        # Avoid making requests too quickly.
        time.sleep(1)

    else:

        print(f"journal {jid} already exists")


# ---------------------------------------------------------------------
# Update affiliations
# ---------------------------------------------------------------------

print("Update affiliations...")

for affiliation in affiliations:

    if not db.record_exists("affiliations", affiliation):

        affiliation_raw = scopus.get_affiliation(affiliation)

        # Scopus may return None for an unavailable affiliation.
        if affiliation_raw is None:
            print(
                f"Skipping affiliation {affiliation}: "
                f"no information returned by Scopus"
            )
            continue

        db.insert_affiliation(affiliation_raw)


# ---------------------------------------------------------------------
# Refresh home_pubs.json
# ---------------------------------------------------------------------

query = """
SELECT
    substr(a.year, 1, 4)          AS year,
    a.title                       AS title,
    GROUP_CONCAT(au.auth, ', ')   AS authors,
    j.title                       AS journal,
    a.doi                         AS doi
FROM articles AS a

-- Split the "1|2|3" author string into rows via JSON
JOIN json_each(
    '["'
    || replace(a.authors, '|', '","')
    || '"]'
) AS split_ids
    ON TRUE

-- Map each split ID back to the authors table
JOIN authors AS au
    ON au.id = split_ids.value

LEFT JOIN journals AS j
    ON j.id = a.journal_id

GROUP BY a.id

ORDER BY
    year DESC,
    a.citations DESC

LIMIT 3;
"""


print("Looking for new publications for the home page")

rows = db.execute_query(query)

data = []

for row in rows:
    data.append(dict(row))


output = {
    "homePubs": data
}

out_path = Path("sections/home_pubs.json")

with out_path.open("w", encoding="utf-8") as f:
    json.dump(
        output,
        f,
        ensure_ascii=False,
        indent=2
    )


# ---------------------------------------------------------------------
# Record update time
# ---------------------------------------------------------------------

now = datetime.utcnow().replace(
    microsecond=0
).isoformat() + "Z"

out = Path("data/last_updated.txt")
out.write_text(now, encoding="utf-8")