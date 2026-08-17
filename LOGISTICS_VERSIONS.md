# Logistics record versions

The admin page loads the current record by product number.

1. Open `https://www.cyndiglobal.com/admin/logistics.html` and sign in.
2. Enter `HRT-01` or `HRT-02` in **Product number**.
3. Wait for the current logistics text and warehouse image URLs to load.
4. Edit the record, upload any new images, then click **Save record**.
5. The save creates a new numbered version and refreshes the current record.

The buttons below the product field load older versions. Older versions retain the logistics text and the warehouse image URLs that were saved with that version. The public tracking page always shows the latest version.

The version table is created by `migrations/0003_logistics_record_versions.sql`.
