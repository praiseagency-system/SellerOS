# Katalog Tool MCP tt-ads-mcp-layer

> Dienumerasi read-only via `tool_list` 2026-08-25 (scripts/gmvmax-tool-catalog.mjs).
> Total grup: 48, total tool: 379.

## ad (6)
- `ad_audience_size_estimate` — Estimates audience size for a targeting configuration similar to ad group creation using /open_api/v1.3/ad/audience_s...
- `ad_create` — Creates regular ads by uploading ad creatives such as images, videos, text, and call-to-action settings to /open_api/...
- `ad_get` — Gets regular ads and Smart Creative ads.
- `ad_review_info_get` — Gets ad review information for one or more ads.
- `ad_status_update` — Enable, disable, or delete one or more ads by updating their operation status.
- `ad_update` — Updates creatives for regular ads, including call-to-action, ad name, text, image, and video material, via `POST /ope...

## adgroup (11)
- `adgroup_appeal` — Appeals a rejected ad group and requests re-evaluation after review rejection.
- `adgroup_budget_update` — Updates the lifetime budgets of one or more ad groups, or schedules changes to the daily budgets or dynamic daily bud...
- `adgroup_create` — Creates an ad group under an existing campaign at /open_api/v1.3/adgroup/create/.
- `adgroup_get` — Gets detailed information for one or more ad groups from `/open_api/v1.3/adgroup/get/`.
- `adgroup_quota_get` — Gets the dynamic quota for the number of active auction ad groups an advertiser can have.
- `adgroup_review_info_get` — Gets ad group review information, including approval status, rejection reasons, and suggestions so you can fix reject...
- `adgroup_rf_create` — Creates a Reach & Frequency ad group via `/open_api/v1.3/adgroup/rf/create/`.
- `adgroup_rf_estimated_info_get` — Queries estimated daily cost and frequency distribution for Reach & Frequency ad groups via /open_api/v1.3/adgroup/rf...
- `adgroup_rf_update` — Updates a Reach & Frequency ad group via /open_api/v1.3/adgroup/rf/update/.
- `adgroup_status_update` — Enables, disables, or deletes ad groups through `/open_api/v1.3/adgroup/status/update/`.
- `adgroup_update` — Updates an ad group via `POST /open_api/v1.3/adgroup/update/`.

## advertiser (5)
- `advertiser_balance_get` — Gets the balance of ad accounts in a Business Center and, for ad accounts owned by the Business Center in auto-alloca...
- `advertiser_info_get` — Retrieves details for one or more advertiser ad accounts from `/open_api/v1.3/advertiser/info/`.
- `advertiser_transaction_get` — Gets ad account transaction records in a Business Center.
- `advertiser_update` — Updates ad accounts created in Business Centers via /open_api/v1.3/advertiser/update/.
- `auth_advertiser_get` — Get authorized ad accounts.

## app (6)
- `app_create` — Creates a mobile app in Events API at `/v1.3/app/create/`.
- `app_info_get` — Retrieves details for an app in Events API.
- `app_list_get` — Returns the list of apps under the specified advertiser account from `/open_api/v1.3/app/list/`.
- `app_optimization_event_get` — Gets app optimization/conversion event information for an app via `/v1.3/app/optimization_event/`.
- `app_optimization_event_retargeting_get` — Retrieves app retargeting optimization events for a specified app.
- `app_update` — Updates a mobile app in Events API.

## audience (42)
- `audience_insight_info_get` — Gets potential audience insight details for an advertiser from /open_api/v1.3/audience/insight/info/.
- `audience_insight_overlap_get` — Gets audience overlap details between one benchmark TikTok Custom Audience and up to four comparison Custom Audience...
- `audience_segment_operate` — Creates or deletes an audience segment through the Streaming API endpoint `/open_api/v1.3/segment/audience/`.
- `dmp_custom_audience_apply` — Applies a custom audience to, or disconnects a custom audience from, multiple ad groups.
- `dmp_custom_audience_apply_log_get` — Gets the latest application log for custom audiences from /dmp/custom_audience/apply/log/.
- `dmp_custom_audience_create` — Creates a custom audience from previously uploaded audience file data.
- `dmp_custom_audience_delete` — Deletes audiences using /v1.3/dmp/custom_audience/delete/.
- `dmp_custom_audience_get` — Gets details for specified audiences, including current status and modification history.
- `dmp_custom_audience_list_get` — Gets all audiences for an advertiser, including both owned and shared audiences.
- `dmp_custom_audience_lookalike_create` — Creates a lookalike audience for an advertiser using an existing audience under the same advertiser account as the se...
- `dmp_custom_audience_lookalike_update` — Manually refreshes one or more Lookalike Audiences for the specified advertiser.
- `dmp_custom_audience_rule_create` — Creates a custom audience from rule-based inclusion criteria and optional exclusion criteria.
- `dmp_custom_audience_share_cancel` — Stops sharing a custom audience with advertisers using /v1.3/dmp/custom_audience/share/cancel/.
- `dmp_custom_audience_share_get` — Starts sharing audiences with specified ad accounts in the same Business Center via /open_api/v1.3/dmp/custom_audienc...
- `dmp_custom_audience_share_log_get` — Gets the sharing log for a custom audience, including the advertiser IDs and advertiser names the audience has been s...
- `dmp_custom_audience_update` — Updates an audience's name or, for Customer File audiences only, its uploaded audience files through `/open_api/v1.3/...
- `dmp_saved_audience_create` — Creates a Saved Audience for an advertiser account using demographic, audience, interest, action, and device targetin...
- `dmp_saved_audience_delete` — Deletes Saved Audiences.
- `dmp_saved_audience_list_get` — Gets the details of Saved Audiences associated with an ad account.
- `pangle_audience_package_get` — Gets the Pangle audience packages available to an advertiser.
- `pangle_block_list_get` — Gets the Pangle block list for an ad account.
- `pangle_block_list_update` — Updates the Pangle block list for an advertiser at `/v1.3/pangle_block_list/update/`.
- `targeting_search` — Searches targeting categories and hashtags for interests and behaviors from seed keywords, or lists all available cat...
- `tiktok_inventory_filters_get` — Retrieves an ad account's Brand Safety Hub settings.
- `tiktok_inventory_filters_update` — Sets or updates an ad account's Brand Safety Hub settings, which define default first-party brand safety controls at...
- `tool_action_category_get` — Gets action category enumeration values (also called behavioral categories).
- `tool_brand_safety_partner_authorize_status_get` — Gets the authorization status of your Brand Safety post-bid measurement partner for an advertiser.
- `tool_carrier_get` — Retrieves carrier enumeration values for different countries or locations.
- `tool_content_exclusion_get` — Gets the content exclusion categories and, when eligible, vertical sensitivity categories that can be excluded from a...
- `tool_content_exclusion_info_get` — Gets detailed information for content exclusion categories and vertical sensitivity categories that can be excluded f...
- `tool_contextual_tag_get` — Returns contextual tags available for targeting for the specified advertiser, advertising objective, and optional reg...
- `tool_contextual_tag_info_get` — Gets detailed information for contextual tags.
- `tool_device_model_get` — Returns device model enumeration values for an advertiser from `/open_api/v1.3/tool/device_model/`.
- `tool_hashtag_get` — Gets targeting hashtag names and availability statuses for the specified hashtag IDs.
- `tool_hashtag_recommend_search` — Search for targeting hashtags based on seed keywords.
- `tool_interest_category_get` — Gets general interest category enumeration values.
- `tool_interest_keyword_get` — Gets additional interest categories by ID from /v1.3/tool/interest_keyword/get/.
- `tool_interest_keyword_recommend_search` — Searches for additional interest categories related to one or more seed keywords.
- `tool_targeting_category_recommend_get` — Returns recommended interest categories and action categories based on historical performance data in the same indust...
- `tool_targeting_info_get` — Gets details for targeting tags by ID, including location IDs, zip code IDs (US only), postal code IDs (Canada, Brazi...
- `tool_targeting_list_get` — Gets targeting tags for Internet Service Provider targeting and returns ISP IDs that can be used for ad audience targ...
- `tool_targeting_search` — Search location targeting tags by keyword and return location IDs, zip code IDs, or postal code IDs for use in target...

## bc (51)
- `asset_bind_quota_get` — Checks an asset's ad-binding quota: how many ads the asset is already bound to and how many additional ads it can sti...
- `bc_account_budget_changelog_get` — Retrieves the budget change history for an ad account within a Business Center.
- `bc_account_cost_get` — Retrieves cost records at the ad account and Business Center levels for a specified Business Center.
- `bc_account_transaction_get` — Retrieves transaction records for a Business Center, its ad accounts, or its Payment Portfolio from /open_api/v1.3/bc...
- `bc_advertiser_attribute_get` — Retrieves the currency codes and registration-area location codes for ad accounts within a Business Center.
- `bc_advertiser_create` — Creates an ad account in a Business Center via `/open_api/v1.3/bc/advertiser/create/`.
- `bc_advertiser_disable` — Disables an ad account in Business Center via `/open_api/v1.3/bc/advertiser/disable/`.
- `bc_advertiser_qualification_get` — Retrieves existing qualifications within a Business Center from `/bc/advertiser/qualification/get/`.
- `bc_advertiser_unionpay_info_check` — Checks whether UnionPay verification is required for a business license.
- `bc_advertiser_unionpay_info_submit` — Submits UnionPay verification for the business license associated with an ad account.
- `bc_asset_account_authorization_get` — Generates an authorization URL that a Business Center can share with a TikTok account owner to request ad delivery pe...
- `bc_asset_admin_delete` — Deletes assets from a Business Center via /v1.3/bc/asset/admin/delete/.
- `bc_asset_admin_get` — Gets additional information about assets in a Business Center for Business Center Admin users.
- `bc_asset_advertiser_assign` — Links a TikTok account asset to an ad account in a Business Center using /open_api/v1.3/bc/asset/advertiser/assign/.
- `bc_asset_advertiser_assigned_get` — Retrieves the list of ad accounts linked to a TikTok account in a Business Center.
- `bc_asset_advertiser_unassign` — Unlinks a TikTok account from an ad account in a Business Center using `/open_api/v1.3/bc/asset/advertiser/unassign/`.
- `bc_asset_assign` — Assigns a Business Center asset to a TikTok For Business user who already belongs to the same Business Center.
- `bc_asset_get` — Gets Business Center assets that the authorized user, or a specified user, has access to.
- `bc_asset_group_create` — Creates an Asset Group in a Business Center at `/open_api/v1.3/bc/asset_group/create/`.
- `bc_asset_group_delete` — Deletes Asset Groups from your Business Center via `/open_api/v1.3/bc/asset_group/delete/`.
- `bc_asset_group_get` — Gets the assets or members of an Asset Group in a Business Center.
- `bc_asset_group_list` — Retrieves all Asset Groups in a Business Center.
- `bc_asset_group_update` — Updates an Asset Group's assets, members, or name via `/open_api/v1.3/bc/asset_group/update/`.
- `bc_asset_member_get` — Gets the members who have access to a specified Business Center asset.
- `bc_asset_partner_get` — Gets the partners that a particular Business Center asset has been shared with.
- `bc_asset_unassign` — Revokes a user's access to an asset in a Business Center.
- `bc_balance_get` — Gets the balance information for a Business Center.
- `bc_billing_group_advertiser_list` — Gets the list of advertisers bound to a Billing Group.
- `bc_billing_group_create` — Creates a Billing Group in a Business Center using /open_api/v1.3/bc/billing_group/create/.
- `bc_billing_group_get` — Retrieves all Billing Groups in a Business Center via `/open_api/v1.3/bc/billing_group/get/`.
- `bc_billing_group_update` — Updates the settings of a Business Center billing group at `/open_api/v1.3/bc/billing_group/update/`.
- `bc_get` — Returns the list of Business Centers the authenticated user can access.
- `bc_invoice_get` — Gets invoices for a Business Center account.
- `bc_invoice_task_create` — Creates an asynchronous Business Center invoice download task.
- `bc_invoice_task_get` — Checks whether a `BILLING_REPORT` asynchronous invoice download task has completed for a Business Center.
- `bc_invoice_task_list` — Gets asynchronous Business Center invoice download tasks of type `BILLING_REPORT`, `INVOICE_LIST`, and `INVOICE_BATCH`.
- `bc_invoice_unpaid_get` — Gets the total unpaid amount for a Business Center account.
- `bc_member_delete` — Deletes a member from a Business Center or revokes a pending member invitation.
- `bc_member_get` — Gets members in a Business Center.
- `bc_member_invite` — Invites users to a Business Center and optionally assigns Business Center roles, ad account access, and advanced fina...
- `bc_member_update` — Updates a Business Center member's user name, basic role, and optional advanced finance role in the Business Center.
- `bc_partner_add` — Adds a partner Business Center to your Business Center and can optionally share assets that your Business Center owns...
- `bc_partner_asset_delete` — Cancels sharing of Business Center assets with a partner via `/open_api/v1.3/bc/partner/asset/delete/`.
- `bc_partner_asset_get` — Gets assets shared between your Business Center and a partner Business Center, including assets you shared with the p...
- `bc_partner_delete` — Deletes a partner Business Center relationship from a Business Center.
- `bc_partner_get` — Gets the list of partners for a Business Center.
- `bc_pixel_link_get` — Gets the list of ad accounts linked to the specified pixel.
- `bc_pixel_link_update` — Links a pixel to ad accounts or unlinks a pixel from ad accounts through `/open_api/v1.3/bc/pixel/link/update/`.
- `bc_pixel_transfer` — Transfers a pixel to a Business Center (BC) using POST /open_api/v1.3/bc/pixel/transfer/.
- `bc_transaction_get` — Retrieves transaction records for a Business Center via `/open_api/v1.3/bc/transaction/get/`.
- `bc_transfer` — Processes a Business Center payment transfer: recharge money to or deduct money from an ad account in a Business Cent...

## blockedword (8)
- `blockedword_check` — Checks whether each word in a provided list is blocked for the specified advertiser.
- `blockedword_create` — Adds words to an ad account's blocked word list.
- `blockedword_delete` — Deletes one or more words from an advertiser's blocked-word list at /v1.3/blockedword/delete/.
- `blockedword_list_get` — Gets the list of blocked words for an ad account from /v1.3/blockedword/list/.
- `blockedword_task_check` — Checks the status of a blocked word export task.
- `blockedword_task_create` — Creates a blocked word export task for an advertiser.
- `blockedword_task_download` — Downloads the exported blocked words file after an export task completes.
- `blockedword_update` — Replaces an existing blocked word with a new word for the specified advertiser.

## campaign (7)
- `campaign_copy_task_check` — Checks the result of an asynchronous campaign copy task created by /campaign/copy/task/create/.
- `campaign_copy_task_create` — Creates an asynchronous task to copy one campaign at a time.
- `campaign_create` — Creates a campaign at /open_api/v1.3/campaign/create/.
- `campaign_get` — Gets campaigns for an ad account, with optional filters to return only matching campaigns.
- `campaign_quota_info_get` — Gets quota information for SKAN Dedicated Campaigns by ad network, including campaign quota for an iOS app, ad group...
- `campaign_status_update` — Enables, pauses, or deletes one or more campaigns via `/v1.3/campaign/status/update/`.
- `campaign_update` — Updates an existing campaign.

## catalog (37)
- `catalog_available_country_get` — Returns the country and region codes where ads for a catalog can be delivered.
- `catalog_capitalize_migrate` — Migrates a catalog from an ad account to a Business Center using /open_api/v1.3/catalog/capitalize/.
- `catalog_create` — Creates and sets up a catalog with its name, catalog type, primary targeting region, and currency at /v1.3/catalog/cr...
- `catalog_delete` — Deletes an existing catalog via `/v1.3/catalog/delete/`.
- `catalog_eventsource_bind` — Binds an app event source and/or website event source to a catalog in a Business Center using /open_api/v1.3/catalog/...
- `catalog_eventsource_bind_get` — Gets the binding information for app or web event sources associated with a catalog in a Business Center.
- `catalog_eventsource_unbind` — Unbinds an app event source or website event source from a catalog in a Business Center.
- `catalog_feed_create` — Creates a catalog feed.
- `catalog_feed_delete` — Deletes a catalog feed using /v1.3/catalog/feed/delete/.
- `catalog_feed_get` — Gets information about a specific catalog feed or, if `feed_id` is omitted, all feeds under a catalog.
- `catalog_feed_log_get` — Returns the last 10 operations for a catalog feed.
- `catalog_feed_switch_update` — Updates a feed's schedule status using /open_api/v1.3/catalog/feed/switch/.
- `catalog_feed_update` — Updates an existing catalog feed at `/open_api/v1.3/catalog/feed/update/`.
- `catalog_get` — Gets information about a specific catalog or all catalogs under a Business Center using /open_api/v1.3/catalog/get/.
- `catalog_insight_category_get` — Retrieves the number of products in an E-commerce catalog that match the top 50 trending product categories on TikTok...
- `catalog_insight_filter_get` — Retrieves available filter values for generating targeted product insights on a limited number of products in an E-co...
- `catalog_insight_product_get` — Retrieves up to 50 trending products in an E-commerce catalog, ranked by TikTok user engagement.
- `catalog_lexicon_get` — Retrieves the lexicon list for a catalog.
- `catalog_location_currency_get` — Gets the list of locations (country or region codes) supported by the Catalog Management API and the supported curren...
- `catalog_overview_get` — Gets a catalog overview with counts of products in different audit statuses, including approved, rejected, and proces...
- `catalog_product_delete` — Deletes catalog products in bulk.
- `catalog_product_file_upload` — Uploads catalog products from a CSV file URL and processes the add/update task asynchronously.
- `catalog_product_get` — Gets products from a product catalog.
- `catalog_product_log_get` — Checks the processing result of a product upload or deletion task for a catalog, including whether products were hand...
- `catalog_product_update` — Updates catalog products in batch, asynchronously, for a specific catalog/feed.
- `catalog_product_upload` — Uploads catalog products in batch for a catalog feed.
- `catalog_set_create` — Creates a product set in a catalog under your Business Center using condition-based filters.
- `catalog_set_delete` — Deletes product sets from a product catalog under a Business Center using /open_api/v1.3/catalog/set/delete/.
- `catalog_set_get` — Gets either all product sets in a catalog under your Business Center or one specific product set.
- `catalog_set_product_get` — Gets the products contained in a product set.
- `catalog_set_update` — Updates a product set's name and/or filter conditions via `/open_api/v1.3/catalog/set/update/`.
- `catalog_update` — Updates a catalog's name.
- `catalog_video_delete` — Deletes uploaded catalog videos from an E-commerce catalog.
- `catalog_video_file_upload` — Uploads catalog videos from a CSV file URL and returns a feed log ID.
- `catalog_video_get` — Retrieves uploaded catalog videos within an E-commerce catalog via `/open_api/v1.3/catalog/video/get/`.
- `catalog_video_log_get` — Checks the processing result of a catalog video upload task, including whether catalog videos were uploaded successfu...
- `catalog_video_package_get` — Gets information about all catalog video packages, or a specific catalog video package, under a Business Center.

## changelog (4)
- `changelog_get` — Gets the activity log for a Business Center.
- `changelog_task_check` — Checks whether a change log download task has completed.
- `changelog_task_create` — Initiates a change log download task for an ad account using the specified filters.
- `changelog_task_download` — Downloads the change log file for a previously created change log task from /open_api/v1.3/changelog/task/download/.

## comment (8)
- `comment_delete` — Deletes a comment via `/open_api/v1.3/comment/delete/`.
- `comment_list_get` — Gets comments under video ads in an ad account for a specified search value and time range.
- `comment_post_create` — Replies to a comment on a TikTok ad via /v1.3/comment/post/.
- `comment_reference_get` — Gets comments related to a specified comment.
- `comment_status_update` — Changes the status of a list of comments between public and hidden using /v1.3/comment/status/update/.
- `comment_task_check` — Checks the status of a comment export task.
- `comment_task_create` — Creates a task to export ad comments.
- `comment_task_download` — Downloads exported ad comments data after an export task completes successfully from /v1.3/comment/task/download/.

## creative (14)
- `creative_ads_preview_create` — Creates a preview link for an ad or creative using /open_api/v1.3/creative/ads_preview/create/.
- `creative_asset_delete` — Deletes creative assets for an advertiser via `/open_api/v1.3/creative/asset/delete/`.
- `creative_asset_share_get` — Shares existing creative assets from one advertiser account to other advertiser accounts via `/open_api/v1.3/creative...
- `creative_auto_message_create` — Creates a welcome message in an ad account using `/open_api/v1.3/creative/auto_message/create/`.
- `creative_auto_message_get` — Retrieves welcome messages from the welcome message library of the specified ad account via `/open_api/v1.3/creative/...
- `creative_cta_recommend_get` — Gets recommended call-to-actions (CTAs) for ad creation or update.
- `creative_fatigue_get` — Retrieves Creative Fatigue Detection results for a specific ad over a specified past time range.
- `creative_image_edit_get` — Edits an existing image from the Asset Library by cropping to a fixed size or applying creative trimming, then automa...
- `creative_portfolio_create` — Creates a creative portfolio of assets via `/open_api/v1.3/creative/portfolio/create/`.
- `creative_portfolio_delete` — Bulk deletes creative portfolios (interactive add-ons) for an advertiser.
- `creative_portfolio_get` — Gets an existing creative portfolio by ID from /open_api/v1.3/creative/portfolio/get/.
- `creative_portfolio_list_get` — Retrieves creative portfolios created under an ad account.
- `creative_smart_text_get` — Generates Smart Text ad title recommendations with the `/open_api/v1.3/creative/smart_text/generate/` endpoint.
- `creative_report_get` — Runs a basic report on creative assets using /open_api/v1.3/creative/report/get/.

## crm (2)
- `crm_create` — Creates a CRM (Customer Relationship Management) Event Set within an advertiser account.
- `crm_list_get` — Gets the list of CRM (Customer Relationship Management) Event Sets in an advertiser account.

## ctm (1)
- `ctm_message_event_set_get` — Retrieves message event sets in an ad account that can be used to create TikTok Instant Messaging Ads.

## custom_conversion (5)
- `custom_conversion_create` — Creates a Custom Conversion for a Pixel or an App using rule-based conditions.
- `custom_conversion_delete` — Deletes a Custom Conversion for a Pixel or an App.
- `custom_conversion_get` — Retrieves the details of a Custom Conversion associated with a Pixel or an App.
- `custom_conversion_list_get` — Retrieves the Custom Conversions associated with an event source, which can be either a Pixel or an App, via `/open_a...
- `custom_conversion_update` — Updates an existing Custom Conversion for a Pixel or an App.

## diagnostic (5)
- `diagnostic_catalog_eventsource_issue_get` — Retrieves diagnostic information for event sources bound to a catalog.
- `diagnostic_catalog_eventsource_metric_get` — Retrieves app-event or pixel-event trend metrics for a catalog, including the number of events available for retarget...
- `diagnostic_catalog_get` — Retrieves catalog product diagnostic information synchronously for a catalog.
- `diagnostic_catalog_product_task_create` — Creates an asynchronous download task for catalog product diagnostic information.
- `diagnostic_catalog_product_task_get` — Gets the status and downloadable CSV URL for an asynchronous catalog product diagnostic export task created with /dia...

## file (13)
- `file_image_ad_info_get` — Gets information about images stored in the Asset Library.
- `file_image_ad_search` — Search image creatives in an advertising account's Asset Library via /v1.3/file/image/ad/search/.
- `file_image_ad_update` — Updates the name of an existing image.
- `file_image_ad_upload` — Uploads an image to the Asset Library and returns an image ID for ad creation.
- `file_music_get` — Gets the list of music available for video creation or Carousel Ads creation from both the advertiser's uploaded musi...
- `file_music_upload` — Uploads music and returns a music ID, or performs music-list actions for Carousel Ads.
- `file_name_check` — Checks whether one or more image or video file names have already been used under the same ad account (`advertiser_id`).
- `file_temporarily_upload` — Uploads a file to TikTok's temporary file repository and returns a file ID.
- `file_video_ad_info_get` — Retrieves information for a list of Asset Library videos that can be used in ads.
- `file_video_ad_search` — Searches video creatives in an ad account's Asset Library that can be used in ads.
- `file_video_ad_update` — Updates the name of a video at /v1.3/file/video/ad/update/.
- `file_video_ad_upload` — Uploads a video to the Asset Library and returns a video ID for ad creation.
- `file_video_suggestcover_get` — Gets a list of suggested thumbnail images for a video creative from `GET /open_api/v1.3/file/video/suggestcover/`.

## gmv_max (19)
- `campaign_gmv_max_create` — Creates a GMV Max campaign at `/campaign/gmv_max/create/`.
- `campaign_gmv_max_info_get` — Retrieves the details of a GMV Max Campaign.
- `campaign_gmv_max_session_create` — Creates a session in a Product GMV Max Campaign for either max delivery on a specific product or creative boost on a...
- `campaign_gmv_max_session_delete` — Deletes a session in an active Product GMV Max Campaign.
- `campaign_gmv_max_session_get` — Retrieves details for max delivery or creative boost sessions for the specified session IDs in a Product GMV Max Camp...
- `campaign_gmv_max_session_list_get` — Retrieves all active max delivery sessions for products and creative boost sessions for videos within a Product GMV M...
- `campaign_gmv_max_session_update` — Updates an active max delivery session for a specific product or an active creative boost session for a specific vide...
- `campaign_gmv_max_update` — Updates a GMV Max campaign via `/campaign/gmv_max/update/`.
- `gmv_max_bid_recommend_get` — Gets the recommended ROI target and daily budget for a Product GMV Max or LIVE GMV Max campaign for a specific TikTok...
- `gmv_max_campaign_get` — Retrieves GMV Max campaigns in an ad account from `/open_api/v1.3/gmv_max/campaign/get/`.
- `gmv_max_creative_update` — Removes creatives (TikTok posts/videos) from a Product or Live GMV Max Campaign, or adds back creatives that were pre...
- `gmv_max_exclusive_authorization_create` — Authorizes one ad account to exclusively create GMV Max Campaigns for a specific TikTok Shop.
- `gmv_max_exclusive_authorization_get` — Checks whether an ad account is exclusively authorized to create GMV Max Campaigns for a specific TikTok Shop.
- `gmv_max_identity_get` — Returns the list of identities associated with a TikTok Shop and indicates whether each identity is available for GMV...
- `gmv_max_occupied_custom_shop_ads_list_check` — Checks whether an identity or product is already occupied by enabled Shopping Ads, including Video Shopping Ads, Prod...
- `gmv_max_report_get` — Runs a report for GMV Max Campaigns.
- `gmv_max_store_list_get` — Returns the list of TikTok Shops that the specified ad account can access and indicates whether each shop can be used...
- `gmv_max_store_shop_ad_usage_check_check` — Checks whether a TikTok Shop is already occupied by enabled Video Shopping Ads or Product Shopping Ads, and whether t...
- `gmv_max_video_get` — Retrieves TikTok posts (videos) that are available for a Product GMV Max campaign for a specific TikTok Shop.

## identity (7)
- `identity_get` — Gets the list of identities under an ad account from /open_api/v1.3/identity/get/.
- `identity_info_get` — Retrieves details about an identity from /v1.3/identity/info/.
- `identity_live_get` — Retrieves live videos under a specified identity.
- `identity_music_authorization_get` — Gets music authorization information for a TikTok post under an identity via /v1.3/identity/music/authorization/.
- `identity_native_series_get` — Retrieves the list of available TikTok Series from a specified TikTok account identity that can be promoted by an ad...
- `identity_video_get` — Gets all TikTok posts under an identity through `/open_api/v1.3/identity/video/get/`.
- `identity_video_info_get` — Gets information for one or more TikTok posts published using the `AUTH_CODE`, `TT_USER`, or `BC_AUTH_TT` identity.

## lead (2)
- `lead_field_get` — Retrieves the field names collected by an Instant Form or by direct message leads using /open_api/v1.3/lead/field/get/.
- `lead_get` — Retrieves a single lead generated either from an Instant Form or from direct messages of the associated Business Acco...

## minis (1)
- `minis_get` — Retrieves the list of TikTok Minis in an ad account.

## offline (4)
- `offline_create` — Creates a new Offline Event set.
- `offline_delete` — Deletes an Offline Event set under an advertiser account.
- `offline_get` — Gets the list of Offline Event sets under an advertiser account.
- `offline_update` — Updates an Offline Event set's `name`, `auto_tracking`, or both.

## optimizer (8)
- `optimizer_rule_batch_bind_get` — Binds objects to an existing automated rule or unbinds objects that were previously bound to that rule.
- `optimizer_rule_create` — Creates automated rules.
- `optimizer_rule_get` — Retrieves automated rules by rule ID from /open_api/v1.3/optimizer/rule/get/.
- `optimizer_rule_list_get` — Gets automated rules for an advertiser that match the provided filters.
- `optimizer_rule_result_get` — Gets automated rule execution result details for the specified execution IDs and rule IDs.
- `optimizer_rule_result_list_get` — Returns automated rule execution results, filtered by rule status, rule ID or name, action, time range, and data dime...
- `optimizer_rule_update` — Updates automated rule details for an advertiser via `/v1.3/optimizer/rule/update/`.
- `optimizer_rule_update_status_update` — Turns on, turns off, or deletes a group of automated rules via /open_api/v1.3/optimizer/rule/update/status/.

## page (6)
- `page_field_get` — Retrieves the fields of an Instant Form (lead form).
- `page_get` — Gets page IDs and page records from /open_api/v1.3/page/get/ so you can use the returned `page_id` in ads.
- `page_lead_task_create` — Creates an asynchronous lead download task for all leads associated with the specified `page_id` or `ad_id`.
- `page_lead_task_download` — Downloads leads for a completed lead download task.
- `page_library_get` — Gets the form libraries you have access to.
- `page_library_transfer` — Migrates leads from an ad account to a Business Center by creating a form library to hold the ad account's leads.

## payment_portfolio (6)
- `payment_portfolio_advertiser_get` — Retrieves the list of ad accounts linked to a Payment Portfolio, with paginated results.
- `payment_portfolio_advertiser_update` — Links one or more ad accounts to an Advanced Payment Portfolio using `/payment_portfolio/advertiser/update/`.
- `payment_portfolio_create` — Creates a Payment Portfolio and links eligible ad accounts to it.
- `payment_portfolio_credit_line_update` — Allocates a client's credit line across one or more Payment Portfolios using percentage-based allocation.
- `payment_portfolio_get` — Retrieves Payment Portfolios that belong to the same client as the specified Business Center.
- `payment_portfolio_user_get` — Retrieves the list of users that have access to a Payment Portfolio.

## pixel (7)
- `pixel_create` — Creates a TikTok Pixel for a website at `/open_api/v1.3/pixel/create/`.
- `pixel_event_create` — Creates Pixel events for a website pixel so you can measure customer actions on your site.
- `pixel_event_delete` — Deletes a Pixel event via /v1.3/pixel/event/delete/.
- `pixel_event_update` — Updates a Pixel event's name and conversion value via `/v1.3/pixel/event/update/`.
- `pixel_instant_page_event_get` — Returns the supported Instant Page events for the specified objective type and optimization goal.
- `pixel_list_get` — Gets a paginated list of pixels for an advertiser, with optional filtering by pixel code, pixel ID, name, sort order...
- `pixel_update` — Updates a pixel's name and optional matching/cookie/data-sharing settings via `/open_api/v1.3/pixel/update/`.

## playable (3)
- `playable_get` — Gets a list of playable creatives for an advertiser from /v1.3/playable/get/.
- `playable_save` — Saves a playable creative at `/open_api/v1.3/playable/save/`.
- `playable_validate` — Checks the validation and audit status of an uploaded playable creative using /open_api/v1.3/playable/validate/.

## report (7)
- `report_ad_benchmark_get` — Gets benchmark performance data for ads, ad groups, or campaigns, comparing them against other ads by the requested d...
- `report_integrated_get` — Run a synchronous integrated report and return report data immediately from `/open_api/v1.3/report/integrated/get/`.
- `report_task_cancel` — Cancels an asynchronous report task that is currently queued or being processed.
- `report_task_check` — Checks the status of an asynchronous report task at /v1.3/report/task/check/.
- `report_task_create` — Creates an asynchronous report task for TikTok Ads reporting via `POST /open_api/v1.3/report/task/create/`.
- `report_task_download` — Downloads the output of a completed asynchronous report task.
- `report_video_performance_get` — Gets in-second performance data for ads or Video Insights data for a video from `/open_api/v1.3/report/video_performa...

## rf (4)
- `rf_contract_query_get` — Queries Reach & Frequency contracts for an advertiser and checks whether a specified date falls within a valid contra...
- `rf_delivery_timezone_get` — Gets the Reach & Frequency (R&F) delivery time zones for the specified locations.
- `rf_inventory_estimate` — Get inventory estimates for Reach & Frequency ads via /open_api/v1.3/rf/inventory/estimate/.
- `rf_order_cancel` — Withdraws a Reach & Frequency (R&F) ad order to suspend delivery.

## search (1)
- `search_region_get` — Returns the locations your ads can be delivered to for a given advertiser ID.

## search_ad (4)
- `search_ad_negative_keyword_add` — Creates Search Ads negative keywords for campaigns or ad groups.
- `search_ad_negative_keyword_delete` — Deletes Search Ads negative keywords for a campaign or ad group via /open_api/v1.3/search_ad/negative_keyword/delete/.
- `search_ad_negative_keyword_get` — Gets the list of Search Ads negative keywords for a campaign or ad group via `/open_api/v1.3/search_ad/negative_keywo...
- `search_ad_negative_keyword_update` — Updates a Search Ads negative keyword at the campaign or ad group level via `/open_api/v1.3/search_ad/negative_keywor...

## showcase (3)
- `showcase_identity_get` — Gets the identities under an ad account that have Showcase permission.
- `showcase_product_get` — Gets the Showcase products that are available for targeting the specified countries or regions.
- `showcase_region_get` — Gets the country or region codes that a Showcase can target for a specified bound identity.

## smart_plus (20)
- `smart_plus_ad_appeal` — Appeals the rejection of an Upgraded Smart+ Ad so the ad can be re-evaluated after failing review.
- `smart_plus_ad_create` — Creates an Upgraded Smart+ ad with creatives, text, landing destinations, catalog settings, and tracking settings via...
- `smart_plus_ad_get` — Retrieves Upgraded Smart+ ads in an ad account from `/open_api/v1.3/smart_plus/ad/get/`.
- `smart_plus_ad_material_status_update` — Disables or enables one or more creatives in an Upgraded Smart+ Ad via `/smart_plus/ad/material_status/update/`.
- `smart_plus_ad_preview` — Previews an Upgraded Smart+ ad before creation or previews an existing Upgraded Smart+ ad.
- `smart_plus_ad_review_info_get` — Retrieves the review results for Upgraded Smart+ Ads, including review details for creatives within those ads.
- `smart_plus_ad_status_update` — Enables, pauses, or deletes Upgraded Smart+ Ads by updating their operation status.
- `smart_plus_ad_update` — Updates an Upgraded Smart+ Ad via `/open_api/v1.3/smart_plus/ad/update/`.
- `smart_plus_adgroup_budget_update` — Updates budgets for one or more Upgraded Smart+ ad groups via `/open_api/v1.3/smart_plus/adgroup/budget/update/`.
- `smart_plus_adgroup_create` — Creates an Upgraded Smart+ ad group via POST `/open_api/v1.3/smart_plus/adgroup/create/`.
- `smart_plus_adgroup_get` — Retrieves Upgraded Smart+ ad groups within an ad account from /open_api/v1.3/smart_plus/adgroup/get/.
- `smart_plus_adgroup_status_update` — Enables, pauses, or deletes Upgraded Smart+ ad groups using /smart_plus/adgroup/status/update/.
- `smart_plus_adgroup_update` — Updates an Upgraded Smart+ ad group via `/open_api/v1.3/smart_plus/adgroup/update/`.
- `smart_plus_campaign_create` — Creates an Upgraded Smart+ campaign via `/open_api/v1.3/smart_plus/campaign/create/`.
- `smart_plus_campaign_get` — Retrieves Upgraded Smart+ campaigns in an ad account from `/open_api/v1.3/smart_plus/campaign/get/`, with optional pa...
- `smart_plus_campaign_status_update` — Enables, pauses, or deletes Upgraded Smart+ campaigns through `/smart_plus/campaign/status/update/`.
- `smart_plus_campaign_update` — Updates an Upgraded Smart+ campaign via `/smart_plus/campaign/update/`.
- `smart_plus_material_report_breakdown_run` — Retrieves an Upgraded Smart+ Creative Breakdown Report for creatives within Upgraded Smart+ Ads.
- `smart_plus_material_report_overview_run` — Retrieves an Upgraded Smart+ Creative Overview Report with reporting data for creatives in Upgraded Smart+ Ads.
- `smart_plus_material_review_info_get` — Retrieves review results for creatives used in Upgraded Smart+ Ads.

## spark_ad (1)
- `spark_ad_recommend_get` — Returns Spark Ads recommendation results for up to 100 video posts associated with a TikTok One (TTO) Creator Marketp...

## split_test (5)
- `split_test_create` — Creates a split test group.
- `split_test_end_get` — Stops an ad group-level or campaign-level split test.
- `split_test_promote_run` — Runs the winning ad group for an ad group-level split test.
- `split_test_result_get` — Retrieves the results of a split test, including p-values for each metric.
- `split_test_update` — Updates the start_time and end_time of a split test.

## store (2)
- `store_list_get` — Gets the list of available first-party stores (TikTok Shops) under an ad account.
- `store_product_get` — Retrieves products in a first-party store (TikTok Shop) from /open_api/v1.3/store/product/get/.

## subscription (3)
- `subscription_get` — Gets the subscription details configured for a developer app from /v1.3/subscription/get/.
- `subscription_subscribe_create` — Creates a webhook subscription for reporting metric data changes, ad account suspension status changes, leads, ad gro...
- `subscription_unsubscribe_cancel` — Cancels a subscription via `/v1.3/subscription/unsubscribe/`.

## tcm (2)
- `tcm_tt_video_apply` — Applies for a creator's authorization to boost a TikTok video for a TikTok Creator Marketplace (TTCM) order or a TikT...
- `tcm_tt_video_status_get` — Gets the Spark Ads authorization status for a TikTok Creator Marketplace (TTCM) order video or a TikTok One (TTO) Cre...

## term (3)
- `term_check` — Checks whether an agreement has been signed for the specified advertiser and term type.
- `term_confirm` — Signs an agreement for the Lead Generation Ads feature for the specified advertiser.
- `term_get` — Gets the agreement text for a specified feature, currently the Lead Generation Ads feature, from `/open_api/v1.3/term...

## tool (10)
- `campaign_label_get` — Retrieves the list of campaign labels in an ad account from `/open_api/v1.3/campaign_label/get/`.
- `tool_bid_recommend` — Get a recommended bid value for an ad group based on basic campaign and ad group settings such as objective, conversi...
- `tool_diagnosis_get` — Gets diagnoses for active ad groups, including possible issues and suggested corrections or improvements.
- `tool_open_url_get` — Gets the corresponding TikTok in-app link for an open TikTok URL.
- `tool_search_diagnosis_health_get` — Retrieves Search Ads Campaign health diagnoses for existing ad groups or ads, including search volume, keyword releva...
- `tool_search_keyword_idea_get` — Discover new keywords and keyword ideas to help reach people interested in your business.
- `tool_search_keyword_recommend` — Returns recommended search keywords and predicted monthly searches for Search Ads Campaigns.
- `tool_timezone_get` — Returns available time zone enumeration values and their GMT offsets for the advertiser.
- `tool_url_validate` — Checks whether a URL is a custom URL scheme, Apple's universal link, or Android App Link, and verifies whether the UR...
- `tool_vbo_status_check` — Checks whether the specified campaign settings are eligible for Value-Based Optimization (VBO) and returns the availa...

## tool_language (1)
- `tool_language_get` — Gets the enum values for supported language codes.

## tool_os_version (1)
- `tool_os_version_get` — Returns the enumeration values for operating system versions.

## tool_phone_region_code (1)
- `tool_phone_region_code_get` — Retrieves the phone number region code list, including each region's code, name, and calling code, from /open_api/v1....

## tool_region (1)
- `tool_region_get` — Gets available ad delivery locations based on objective, placements, and optional targeting constraints such as opera...

## tt_video (4)
- `tt_video_authorize_apply` — Applies a creator-provided authorization code to connect an ad account with a Spark Ads post.
- `tt_video_info_get` — Gets information about a Spark Ads post that the advertiser is authorized to use as an ad via /open_api/v1.3/tt_video...
- `tt_video_list_get` — Gets a list of Spark Ads posts that have been authorized to an ad account.
- `tt_video_unbind` — Unbinds a Spark Ad post after its authorization has expired or been revoked.

## tto (15)
- `tto_oauth2_info_get` — Retrieves the details of a TikTok One (TTO) Creator Marketplace account.
- `tto_oauth2_tcm_get` — Get authorized TTO Creator Marketplace accounts.
- `tto_tcm_anchor_create` — Creates a TikTok One webpage anchor for the web destination link type via `/open_api/v1.3/tto/tcm/anchor/create/`.
- `tto_tcm_anchor_delete` — Deletes an anchor in draft mode that was created on the TikTok One platform.
- `tto_tcm_anchor_get` — Retrieves existing webpage anchors in a TikTok One (TTO) Creator Marketplace account from /open_api/v1.3/tto/tcm/anch...
- `tto_tcm_brand_profile_create` — Creates a Brand Profile for a TikTok One (TTO) Creator Marketplace account at `/open_api/v1.3/tto/tcm/brand/profile/c...
- `tto_tcm_brand_profile_get` — Retrieves the existing Brand Profiles for your TikTok One (TTO) Creator Marketplace account.
- `tto_tcm_campaign_create` — Creates a new TikTok One (TTO) Creator Marketplace campaign or updates an existing one by adding more creators.
- `tto_tcm_campaign_get` — Retrieves TikTok One (TTO) Creator Marketplace campaign information from /open_api/v1.3/tto/tcm/campaign/.
- `tto_tcm_campaign_link` — Sends a request to link a creator's public video to a TikTok One (TTO) Creator Marketplace campaign, or revokes an ex...
- `tto_tcm_campaign_link_status_get` — Retrieves video linking requests for a TikTok One (TTO) Creator Marketplace account, so a brand can view requests to...
- `tto_tcm_campaign_update` — Updates a TikTok One (TTO) Creator Marketplace campaign at `/open_api/v1.3/tto/tcm/campaign/update/`.
- `tto_tcm_category_label_get` — Retrieves creator industry labels or content tag labels associated with TikTok One (TTO) creators.
- `tto_tcm_rank_get` — Gets a paginated list of up to 100 US creators who rank highest for a specified ranking label on the TikTok One (TTO)...
- `tto_tcm_report` — Retrieves reporting data for videos linked to a TikTok One (TTO) Creator Marketplace campaign via /v1.3/tto/tcm/report/.

## user (1)
- `user_info_get` — Retrieves information about the TikTok for Business user authorized to access the developer app.

## video (2)
- `video_fix_task_create` — Creates one or more Smart Fix tasks to automatically detect and fix video issues for an advertiser.
- `video_fix_task_get` — Gets the status and results of a Smart Fix task for a video.
