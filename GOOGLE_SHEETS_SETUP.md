# Google Sheets RSVP setup / Google 試算表出席回函設定

The website now sends RSVP responses directly to a Google Sheet through a small Google Apps Script web app. A Google Form is no longer needed.

網站會透過 Google Apps Script 網頁應用程式，將出席回函直接寫入 Google 試算表，不再需要 Google 表單。

## 1. Create the spreadsheet and script / 建立試算表與程式

1. Create or open the Google Sheet that should receive the responses.
   建立或開啟用來接收出席回函的 Google 試算表。
2. In that sheet, choose **Extensions → Apps Script**.
   在試算表中，選擇 **擴充功能 → Apps Script**。
3. Delete the sample code in `Code.gs`.
   刪除 `Code.gs` 中的預設範例程式碼。
4. Copy all the code from this project's `google-apps-script/Code.gs` into the Google editor and save it.
   將本專案 `google-apps-script/Code.gs` 的完整程式碼複製到 Apps Script 編輯器，並儲存。
5. Select `setupSheet` from the function menu and click **Run** once.
   在函式選單中選取 `setupSheet`，點選一次 **執行**。
6. Approve the Google permission request. The script creates an `RSVP` tab and its column headings.
   核准 Google 的權限要求。程式會建立名為 `RSVP` 的工作表及各欄位標題。

## 2. Deploy it as a web app / 部署為網頁應用程式

1. In Apps Script, choose **Deploy → New deployment**.
   在 Apps Script 中，選擇 **部署 → 新增部署作業**。
2. Select **Web app** as the deployment type.
   將部署類型設為 **網頁應用程式**。
3. Set **Execute as** to **Me** (the spreadsheet owner).
   將 **執行身分** 設為 **我**（試算表擁有者）。
4. Set **Who has access** to **Anyone** so wedding guests do not need to sign in.
   將 **誰可以存取** 設為 **所有人**，讓賓客不必登入 Google 帳號即可填寫回函。
5. Click **Deploy**, then copy the web app URL. Use the URL ending in `/exec`, not the `/dev` test URL.
   點選 **部署**，並複製網頁應用程式網址。請使用以 `/exec` 結尾的網址，不要使用以 `/dev` 結尾的測試網址。

If a Google Workspace account does not offer **Anyone**, its administrator is blocking public web apps. Use a personal Google account or ask the administrator to allow public access.

若 Google Workspace 帳號沒有 **所有人** 選項，代表管理員限制了網頁應用程式的公開存取。請改用個人 Google 帳號，或請管理員開放公開存取權限。

## 3. Connect the website / 連接網站

Open `index.html`, find `GOOGLE_SHEETS_WEB_APP_URL`, and replace its value with the copied `/exec` URL:

開啟 `index.html`，找到 `GOOGLE_SHEETS_WEB_APP_URL`，將其值替換為剛才複製的 `/exec` 網址：

```js
const GOOGLE_SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec';
```

Publish the static website, submit one test RSVP, and verify that a new row appears in the `RSVP` tab.

發布靜態網站後，送出一筆測試回函，並確認 `RSVP` 工作表中出現一筆新資料。

The endpoint accepts form submissions through POST. Test it from the wedding form; opening the `/exec` URL directly does not submit or verify an RSVP.

此端點透過 POST 接收表單。請從婚禮網站填寫回函進行測試；直接開啟 `/exec` 網址不會送出或驗證回函。

Phone numbers are written with the Sheets text prefix so leading zeros are preserved: `0912345678` stays `0912345678`. This applies to new submissions; it does not restore zeros already lost in existing rows.

聯絡電話會加上試算表文字前綴寫入，以保留開頭的 `0`，例如 `0912345678` 仍顯示為 `0912345678`。此修改適用於新的回函，不會補回既有資料已遺失的 `0`。

Guest count and child-seat count are stored as numbers. Guests can select 1–5 people or choose “more than 5” and enter the exact total (at least 6, including themselves). For child seats, select 0–3 or choose “more than 3” and enter the exact quantity (at least 4). Both exact counts are saved in their respective columns and shown in the confirmation. No child seats (or an omitted child-seat selection) is `0`; declined attendance stores `0` for both counts. Existing spreadsheet rows are unchanged.

出席人數及兒童座椅數以數字儲存。賓客可選擇 1–5 人，或選擇「超過5人」後輸入含本人的實際人數（至少 6 人）。兒童座椅可選擇 0–3 張，或選擇「超過3張」後輸入實際數量（至少 4 張）。兩者皆會將確切數字寫入對應欄位，並顯示於送出確認訊息。不需要或未填兒童座椅時記為 `0`；未出席時兩欄皆記為 `0`。既有試算表資料不會改動。

## Updating the Apps Script later / 日後更新 Apps Script

After changing `Code.gs`, open **Deploy → Manage deployments**, edit the web app deployment, select **New version**, and deploy it again. The `/exec` URL normally stays the same.

修改 `Code.gs` 後，開啟 **部署 → 管理部署作業**，編輯現有的網頁應用程式部署，選取 **新版本**，然後重新部署。原本的 `/exec` 網址通常不會改變。

Copying new code into Apps Script is not enough by itself: the public web app keeps using the old version until a new version is deployed.

只將新程式碼貼入 Apps Script 並儲存還不夠；必須部署新版本，公開的網頁應用程式才會使用更新後的程式碼。

For the numeric-count update, deploy the updated Apps Script before publishing `index.html`. The updated script also accepts the older text labels.

更新數字欄位時，請先部署新版 Apps Script，再發布 `index.html`。新版程式也接受舊版網站傳送的選項文字。

## Local checks / 本機檢查

Run `node --test tests/rsvp.test.mjs` from the project directory. The tests simulate Google services to check validation, column order, write confirmation, and failure handling without sending data to a real spreadsheet. A deployed form submission is still needed to verify Google permissions and browser delivery.

在專案目錄執行 `node --test tests/rsvp.test.mjs`。測試會模擬 Google 服務，檢查資料驗證、欄位順序、寫入確認及錯誤處理，不會寫入真實試算表。Google 權限與瀏覽器傳送流程仍需透過部署後的表單確認。
