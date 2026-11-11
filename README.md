# Travel ERP

A travel agency ERP built with Next.js and MongoDB, following the design of the clickable prototype
(still available at `/prototype.html` once deployed).

## What's in this phase

- **Sign-in** for staff, with a one-time setup page that creates the first administrator.
- **Contacts**: customers, B2B agencies, corporate accounts and suppliers, with search and filters.
- **CRM**: opportunities in a drag-and-drop pipeline or a list, with a customer picker that searches
  existing contacts or creates a new one on the spot.
- **Activity log** on every contact and opportunity: changes are recorded by the server, and staff can add notes.
- **Settings**: company details and staff users (administrators only).
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
5. **Redeploy** from the **Deployments** tab (the three-dot menu on the latest deployment, then **Redeploy**),
   so the new variables are used.
6. **Open your site.** The first visit goes to `/setup`: enter the company name and your administrator
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
| `settings` | Company details (`_id: "company"`) |

Indexes are created automatically during setup.

## Next phases

1. Bookings: trip types, services with dates, documents, confirmations and hotel vouchers.
2. Invoicing and payments with receipts, purchasing and expenses.
3. Accounting on the Lebanese chart of accounts, banks and wallets, currencies, reports.
4. B2B portal: requests, quotes, approvals, portal roles and travel documents.
5. Marketing, calendar, document layouts, appearance and WhatsApp or email sharing.

## Before real use

- Move to Vercel Pro or your own servers: the Vercel Hobby plan is for non-commercial use only.
- Add a limit on repeated sign-in attempts and two-step sign-in for administrators.
- Check that backups are enabled for the database, or schedule your own exports.
