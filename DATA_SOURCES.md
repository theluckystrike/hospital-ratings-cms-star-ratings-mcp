# Data sources

All data is read at call time from the CMS Provider Data Catalog on data.cms.gov, the data behind Medicare Care Compare. No key is needed. Reads use the DKAN datastore query API `https://data.cms.gov/provider-data/api/1/datastore/query/<dataset>/0` with `=`, `like` and `in` conditions, and the metastore for each dataset's modified date (`as_of`).

| Dataset | Id | Used for |
| --- | --- | --- |
| Hospital General Information | `xubh-q36u` | name, address, type, ownership, emergency services, overall star rating, measure group counts (mortality, safety, readmission better / no different / worse than national) |
| Patient survey (HCAHPS) - Hospital | `dgck-syfz` | summary star rating, topic star ratings, rated 9 or 10, would definitely recommend, completed surveys, response rate |
| Patient survey (HCAHPS) - National | `99ue-w85f` | national rated 9 or 10 and would recommend |
| Timely and Effective Care - Hospital | `yv7e-xc69` | OP_18b and OP_18c ER median time, OP_22 left before being seen, EDV ER volume, SEP_1 sepsis care, IMM_3 staff flu vaccination, OP_23 stroke head CT |
| Timely and Effective Care - State | `apyc-v239` | state averages |
| Timely and Effective Care - National | `isrn-hqyy` | national averages |
| Footnote Crosswalk | `y9us-9xdf` | footnote texts (copied into the code) explaining missing values |

CMS data on data.cms.gov is a U.S. government work.
