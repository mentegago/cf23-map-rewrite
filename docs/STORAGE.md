# Browser storage contract

Only the current Flutter data system is supported. These formats are used directly by the rewrite. Values below are the native browser values, not Dart's logical preference values.

| Location                                                                | Key                                 | Native value                                                       |
| ----------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| localStorage                                                            | `flutter.favorite_creator_ids`      | JSON array of **strings**, e.g. `["42","1000001"]`                 |
| localStorage                                                            | `flutter.recommendation_profile_v2` | JSON-encoded string containing profile JSON (double JSON encoding) |
| localStorage                                                            | `flutter.recommendation_seed`       | JSON number                                                        |
| localStorage                                                            | `flutter.recommendation_results_v5` | Existing derived cache retained untouched; ranking is recalculated |
| IndexedDB `cf23-map`, version **1**, store `catalog`                    | `snapshot_v3`                       | JSON string containing `{version,catalog,fandomRegistry}`          |
| Same database/store                                                     | `map_v1`                            | JSON string containing `{version,layout,proximity}`                |
| IndexedDB `cf23-analytics`, version **1**, store `events`, keyPath `id` | event ID                            | `{id,created,event}`                                               |
| Same database, store `leases`                                           | `sender`                            | `{owner,until}`                                                    |

Recommendation profile fields remain `schema_version:2`, `explicit_fandom_signals`, and `creator_interactions`. Signal records retain `strength` and `last_updated`. Creator records retain `open_strength`, `deliberate_open_count`, `sample_work_views`, `external_link_clicks`, `shares`, `favorite`, `consideration`, and `last_updated`.

No user-data storage is cleared or renamed. Catalog/map caches are versioned independently; invalid caches are ignored, not deleted. Writes preserve the same serializations, so switching back to Flutter can still read changed favorites/profile/data. A versioned service-worker precache and bounded image cache are additional cache storage, not user-data migration.

Shared URLs support `creator_id`, legacy `creator`, compact `list` and legacy comma-separated `custom_list`. Compact lists retain sorted delta-varints and unpadded URL-safe Base64.

Origin matters: scheme, host, and port must all match. A preview on localhost cannot see data from the production origin. The browser integration suite seeds the original record formats on the preview origin to test compatibility without touching production data.

Obsolete localStorage catalog/map snapshots are neither read nor written. There is no import or migration from earlier data systems. If IndexedDB is unavailable, bundled offline data remains available and refreshed data stays in memory for the session. Current localStorage favorites and recommendation preferences remain supported.
