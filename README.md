# Travel ERP

A travel agency ERP built with Next.js and MongoDB, following the design of the clickable prototype
(still available at `/prototype.html` once deployed).

## What's in this phase

- **Sign-in** for staff, with a one-time setup page that creates the first administrator.
- **Contacts**: customers, B2B agencies, corporate accounts and suppliers, with search and filters.
- **CRM**: opportunities in a drag-and-drop pipeline or a list, with a customer picker that searches
  existing contacts or creates a new one on the spot.
- **Activity log** on every contact and opportunity: changes are recorded by the server, and staff can add notes.
- **Settings**: company details, markup rules by channel and staff users (administrators only).
- **Bookings** (phase 2): trip files with trip types (return, one way, service only), services with From and To
  dates, suppliers, costs, markups and prices, customer and internal notes, and the Draft, Confirmed, Ticketed and
  Cancelled flow with credit-limit checks for agencies and corporate accounts.
- **Convert an opportunity to a booking** from the CRM; the opportunity becomes Won and links to the booking.
- **Documents** on bookings: tickets, vouchers, e-visas and passports in a private Vercel Blob store. Large photos
  are shrunk in the browser before upload, and files open only through the app after a sign-in check.
- **Invoicing** (phase 3): create a draft invoice from a confirmed or ticketed booking, with VAT per service type
  from Settings, then post it to give it a number (INV/2026/0001). Record customer payments into a bank, cash or
  wallet account; each payment gets a receipt number and a printable receipt. A Payments received tab lists them all.
- **Purchasing** (phase 3): purchase orders are created per supplier when a booking is confirmed (or on demand),
  then confirmed, billed with the supplier's bill number, and paid with a printable payment voucher.
- **Expenses** (phase 3): water, stationery, rent and other running costs, by category, paid from an account or
  on credit with a vendor, with a monthly total.
- **Credit limits** now count unpaid invoices as well as open bookings.
- **Accounting** (phase 4, administrators only): journal entries are created automatically from posted invoices,
  customer payments, supplier bills and payments, and posted expenses, on a starter Lebanese chart of accounts
  (classes 1 to 7). If a document goes back to draft or changes, its entry follows. Manual entries cover opening
  balances and adjustments and post only when debits equal credits. Reports: trial balance, general ledger,
  profit and loss, balance sheet, VAT summary by quarter with LBP equivalents, and outstanding balances with ageing.
  Settings choose which account each service, expense category and payment account posts to, and hold currency rates.
- **B2B portal, part 1** (phase 5): customers, agencies and corporate accounts sign in at `/portal` with their own
  accounts, separate from staff sign-in. Staff tick Portal access on a contact, then invite its people from the
  B2B portal app; each person sets their own password from a one-time link. Built-in roles (Account admin, Booker,
  Finance, Viewer, Traveller) plus custom roles control requests, quote acceptance with approval limits, bookings,
  prices, personal documents, invoices, the statement and team management, and every rule is checked on the server.
  Requests appear in the CRM pipeline and stay in step both ways. After 5 wrong passwords, staff and portal
  accounts are locked for 15 minutes.
- **B2B portal, part 2**: suppliers sign in at the same `/portal`. They see purchase orders once you confirm
  them (never your selling prices or internal notes), confirm them with their own reference, message your team,
  upload their bill for you to check and record, and see payment vouchers and their statement. Supplier roles:
  Supplier admin, Reservations and Accounts. Staff and account admins can edit a portal user's name and email.
- VAT now defaults to 0% for every service type; 11% stays available on each line.
- **Products and pricing** (phase 6): a catalogue of the services you sell often, each with its supplier, cost,
  markup (channel default, percentage or fixed USD) and VAT. The list shows the selling price for B2C, B2B and
  Corporate. On a booking, Add from catalogue fills in the service in one click; changing a product later never
  changes bookings already made. Products used on bookings are archived rather than deleted.
- **Calendar** (phase 6): a month grid and a list, built live from your records: departures and returns, hotel
  check-ins and check-outs and other services, customer payments due, supplier payments due, travel dates of open
  opportunities, portal quotes about to expire, and shared reminders your team adds.
- Upload buttons name the chosen file and pulse until it is uploaded, and the browser asks before leaving the page
  with a file chosen but not sent.
- **Share links**: every printed document can be shared by email or WhatsApp. The ERP creates a random link that
  opens only that document, without signing in, and stops working after 30 days (or when cancelled). The message
  opens in your own email app or WhatsApp, and each share is noted in the record's activity log.
- **Printing**: invoices, payment receipts, purchase orders and payment vouchers, plus booking confirmations (prices hidden by default, with a Show prices switch) and hotel vouchers,
  ready to print or save as PDF.
- Every API route checks the signed-in user on the server, and all input is validated before it reaches the database.

## Deploy on Vercel

1. **Upload the code to GitHub.** Delete the old `index.html` from the repository, then upload the contents
   of this folder (not the folder itself) so `package.json` sits at the top level.
2. **Set the framework.** In Vercel, open the project, go to **Settings → Build and Deployment** and set
   **Framework Preset** to **Next.js**. The project was first imported as a plain HTML site, so this matters.
3. **Add the database.** In the project, open **Storage** (or the **Marketplace**), add **MongoDB Atlas**,
   choose the free cluster and connect it to this project. Vercel adds `MONGODB_URI` for you.
   - If you create the cluster yourself at cloud.mongodb.com instead: create a database user, allow
     access from `0.0.0.0/0` under Network Access, and add the connection string as `MONGODB_URI`.
4. **Add the session secret.** Under **Settings → Environment Variables**, add `AUTH_SECRET` with at least
   32 random characters. Generate one with `openssl rand -base64 48`, or any password manager's generator.
5. **Add file storage (phase 2).** In the project, open **Storage → Create → Blob**, choose **Private** access,
   and connect it to this project. Vercel adds `BLOB_READ_WRITE_TOKEN` for you. Without it, everything works
   except attaching documents, which shows a clear message.
6. **Redeploy** from the **Deployments** tab (the three-dot menu on the latest deployment, then **Redeploy**),
   so the new variables are used.
7. **Open your site.** The first visit goes to `/setup`: enter the company name and your administrator
   account, and optionally load the sample data.

Choose the database region close to your users (for Lebanon, Frankfurt is a good choice) and set the
same region for Vercel functions under **Settings → Functions**.

## Run it on your computer

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI and AUTH_SECRET
npm run dev                  # opens on http://localhost:3000
```

## Data

| Collection | Holds |
|---|---|
| `users` | Staff accounts; passwords are stored only as bcrypt hashes |
| `contacts` | Customers, agencies, corporate accounts and suppliers |
| `leads` | CRM opportunities, linked to a contact by `contactId` |
| `activity` | The log and notes for each record (`model`, `recordId`) |
| `settings` | Company details (`company`), markup rules (`pricing`), payment terms, VAT, accounts and expense categories (`finance`) |
| `bookings` | Trip files with their services, notes and document records (`ref`, `contactId`, `status`) |
| `invoices` | Customer invoices with their lines and payments |
| `purchases` | Purchase orders, supplier bills and payments to suppliers |
| `expenses` | Running costs |
| `accounts` | Chart of accounts (code, name, type) |
| `moves` | Journal entries; automatic ones carry the key of the document they come from |
| `portalUsers` | Portal sign-ins for customer accounts; passwords and invitation tokens stored only as hashes |
| `portalRoles` | Custom portal roles (the built-in ones are in the code) |
| `requests` | Portal requests, with quote, conversation and attached files |
| `products` | Catalogue of services with cost, markup and VAT |
| `reminders` | Shared calendar reminders |
| `shares` | Share links for documents; they delete themselves when they expire |
| `counters` | Running numbers for bookings, invoices (per year), receipts, orders, vouchers and expenses |

Indexes are created automatically the first time the app connects after each deployment.
Document files themselves live in the private Blob store, never in MongoDB.

## Next phases

1. ~~Bookings~~ (done in phase 2).
2. ~~Invoicing and payments with receipts, purchasing and expenses~~ (done in phase 3).
3. ~~Accounting on the Lebanese chart of accounts, currencies and reports~~ (done in phase 4).
4. ~~B2B portal for customers~~ (phase 5, part 1). Part 2: supplier portal (done).
5. Marketing, calendar, document layouts, appearance and WhatsApp or email sharing.

## Before real use

- Move to Vercel Pro or your own servers: the Vercel Hobby plan is for non-commercial use only.
- Add a limit on repeated sign-in attempts and two-step sign-in for administrators.
- Check that backups are enabled for the database, or schedule your own exports.
