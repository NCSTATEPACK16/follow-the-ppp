# Stage 5 Tiles Report

- `counties-240930-v1.pmtiles`: 2.4 MB
- `loans-240930-v1.pmtiles`: 931.6 MB
- `zips-240930-v1.pmtiles`: 2.0 MB

Total: 0.91 GB

## County FIPS join

- Matched: 3,226 of 3,239 aggregate rows
- Unmatched: 13 rows, $123,876,222 (0.0157% of national)

| State | County | Loans | Approved |
|---|---|---:|---:|
| CT | WESTERN CT | 158 | $32,143,124 |
| CT | CAPITOL | 182 | $26,245,260 |
| MP | NORTHERN MARIANA ISLANDS | 100 | $13,985,237 |
| CT | SOUTH CENTRAL CT | 147 | $12,629,185 |
| AS | AMERICAN SAMOA | 314 | $12,437,682 |
| CT | GREATER BRIDGEPORT | 90 | $9,490,724 |
| CT | NAUGATUCK VLY | 71 | $6,976,170 |
| CT | SOUTHEASTERN CT | 46 | $4,381,211 |
| CT | LOWER CT RIVER VLY | 56 | $3,796,854 |
| CT | NORTHEASTERN CT | 9 | $1,264,405 |
| CT | NW HILLS | 12 | $443,008 |
| AE | APO | 3 | $50,862 |
| AK | Aleutian Islands | 1 | $32,500 |

These have no counterpart in `cb_2021_us_county_500k`: Connecticut's post-2022 planning regions, AS/MP/AE, and a few tribal and Alaskan areas. They are excluded from the choropleth and from county statistics.
