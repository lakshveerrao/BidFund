import { useEffect } from 'react';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { Footer, Header } from './ui';

type Profile = Infer<typeof ProfileRow>;
export type LegalPage = 'terms' | 'privacy' | 'refunds' | 'shipping';

const EFFECTIVE = '6 September 2026';
const OPERATOR = 'BidFund is a product of Projects by Laksh (India), run by Lakshveer Rao and Adarsh Malpeddiwar';
const CONTACT_EMAIL = 'venky24aug@gmail.com';
const ADDRESS = 'Plot No. 149, Road No. 6, Krushi Nagar, Nagole, Hyderabad 500068, Telangana, India';

const TITLES: Record<LegalPage, string> = {
  terms: 'Terms and Conditions',
  privacy: 'Privacy Policy',
  refunds: 'Refund and Cancellation Policy',
  shipping: 'Shipping and Delivery Policy',
};

// Plain-English legal pages. These are the four documents payment gateways in
// India (Razorpay, Cashfree, PayU, Stripe India) ask for, plus /contact.
export default function Legal({ page, me }: { page: LegalPage; me: Profile | undefined }) {
  useEffect(() => {
    document.title = `${TITLES[page]} — BidFund`;
    return () => {
      document.title = 'BidFund — Micro-Funding for Hardware Builders';
    };
  }, [page]);
  return (
    <>
      <Header me={me} />
      <main className="wrap narrow legal" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <nav className="strip" aria-label="Policies">
          {(Object.keys(TITLES) as LegalPage[]).map(k => (
            <a key={k} href={`/${k}`} className={`chip${k === page ? ' on' : ''}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              {TITLES[k]}
            </a>
          ))}
        </nav>
        <p className="eyebrow" style={{ marginTop: 18 }}>
          Effective {EFFECTIVE}
        </p>
        <h1 className="h2">{TITLES[page]}</h1>
        {page === 'terms' && <Terms />}
        {page === 'privacy' && <Privacy />}
        {page === 'refunds' && <Refunds />}
        {page === 'shipping' && <Shipping />}
        <div className="block">
          <h2>Contact</h2>
          <p>{OPERATOR}.</p>
          <p>
            <b>Registered address:</b> {ADDRESS}
          </p>
          <p>
            <b>Email for any issues:</b> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or use the <a href="/contact">contact page</a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Terms() {
  return (
    <>
      <p className="sub">
        These terms govern your use of bidfund.me and the BidFund service. By using the site you agree to them. If you do not agree, please do not use
        the service.
      </p>
      <div className="block">
        <h2>1. What BidFund is</h2>
        <p>
          BidFund is a micro-funding platform where hardware builders run short, live funding sprints and members of the community ("supporters") commit
          amounts to help a working prototype reach its next milestone. {OPERATOR}. "BidFund", "we" and "us" in these terms mean Projects by Laksh.
        </p>
        <p>
          <b>Support is not an investment.</b> Committing support does not give you equity, ownership, profit share, interest, dividends or any financial
          return. BidFund is not a securities exchange, a lending platform, a bank or a payment institution.
        </p>
      </div>
      <div className="block">
        <h2>2. Simulated payments during the pilot phase</h2>
        <p>
          While BidFund is in its pilot phase, all commitments are <b>simulated</b>. No money is charged, collected or transferred. Amounts shown on the site
          are mock commitments that demonstrate how a sprint works. When real payments are introduced, they will be processed by a licensed third-party
          payment gateway and these terms, the refund policy and the checkout screens will say so clearly before you pay anything.
        </p>
      </div>
      <div className="block">
        <h2>3. Accounts</h2>
        <p>
          To back or list a build you enter a name and an email address and are assigned a username. You are responsible for the accuracy of what you
          enter and for activity that happens through your browser session. One person may not hold several accounts to claim limited builder conditions
          more than once. You may delete your account at any time from your dashboard.
        </p>
      </div>
      <div className="block">
        <h2>4. For builders</h2>
        <p>
          By listing a sprint you confirm that the build is yours (or you have the right to present it), that the prototype described exists, that images
          and descriptions are accurate, and that the goal amount and fund allocation are honest estimates for the stated next step. You are solely
          responsible for delivering any builder condition (perk) you offer, on the terms you state in the listing.
        </p>
        <p>
          You must not list builds that are unlawful, unsafe, infringe someone else's rights, or that promise financial returns. BidFund may edit, hide or
          remove a listing at its discretion.
        </p>
      </div>
      <div className="block">
        <h2>5. For supporters</h2>
        <p>
          A commitment is a voluntary contribution toward a builder's next step. Builder conditions are offered by the builder, not by BidFund. BidFund
          does not guarantee that a build will be completed, that a milestone will be reached, or that a builder condition will be delivered. Limited
          conditions are claimed on a first-confirmed basis; if a condition sells out while you are confirming, your support is kept and you can choose
          another condition or none.
        </p>
      </div>
      <div className="block">
        <h2>6. Fees</h2>
        <p>
          BidFund charges builders 0% platform commission on community support raised through a sprint. When real payments are introduced, third-party
          payment processing fees may apply and will be disclosed at checkout.
        </p>
      </div>
      <div className="block">
        <h2>7. Acceptable use</h2>
        <p>
          Do not misuse the service: no fraud, no impersonation, no harassment of builders or supporters, no automated abuse, no attempts to interfere with
          live sprints or the underlying database. We may block or delete accounts that break these rules.
        </p>
      </div>
      <div className="block">
        <h2>8. Content and intellectual property</h2>
        <p>
          Builders keep all rights to their builds, images and text, and grant BidFund a non-exclusive licence to display them on the site and in share
          previews. The BidFund name, mark and site design belong to Projects by Laksh.
        </p>
      </div>
      <div className="block">
        <h2>9. Disclaimers and liability</h2>
        <p>
          The service is provided "as is" during the pilot phase. To the extent permitted by law, Projects by Laksh and its team are not liable for indirect or
          consequential loss, for the conduct of builders or supporters, or for the outcome of any build. Nothing in these terms limits liability that
          cannot be limited under Indian law.
        </p>
      </div>
      <div className="block">
        <h2>10. Changes, governing law</h2>
        <p>
          We may update these terms; the effective date at the top will change and material changes will be announced on the site. These terms are
          governed by the laws of India, and courts in Hyderabad, Telangana have jurisdiction.
        </p>
      </div>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p className="sub">
        This policy explains what BidFund (a product of Projects by Laksh) collects, why, and what you can do about it. We keep it short because we
        collect very little.
      </p>
      <div className="block">
        <h2>1. What we collect</h2>
        <ul className="proof">
          <li>
            <span>
              <b>Name and email</b> when you enter a sprint, list a build, or use the contact form. Your email is stored in a private table that only the
              BidFund database and the Projects by Laksh team can read; it is never shown to other users.
            </span>
          </li>
          <li>
            <span>
              <b>Username, bio, city and social handles</b> if you choose to add them. These are public on your profile.
            </span>
          </li>
          <li>
            <span>
              <b>Activity</b>: sprints you back, amounts, builder conditions claimed, ratings you give, invitations you send, and which sprint page you are
              on (presence). Support activity is shown publicly on the sprint with your username.
            </span>
          </li>
          <li>
            <span>
              <b>Listing content</b>: build descriptions, images, allocation and milestones you publish as a builder.
            </span>
          </li>
          <li>
            <span>
              <b>Technical data</b>: an anonymous identity token stored in your browser so you stay signed in, plus standard server logs. We do not use
              advertising trackers.
            </span>
          </li>
        </ul>
      </div>
      <div className="block">
        <h2>2. Payment data</h2>
        <p>
          During the pilot phase no payment details are collected; checkout is simulated. When real payments are introduced they will be handled entirely by
          a licensed payment gateway. BidFund will not store card numbers, UPI credentials or bank details.
        </p>
      </div>
      <div className="block">
        <h2>3. How we use it</h2>
        <p>
          To run live sprints, show support activity in real time, send you the sprint link and receipts by email, answer contact-form messages, prevent
          abuse, and improve the service. We do not sell personal data and we do not send marketing email without asking first.
        </p>
      </div>
      <div className="block">
        <h2>4. Who we share it with</h2>
        <p>
          Service providers that host and run BidFund: SpacetimeDB (database and realtime), Vercel (website hosting), and Resend (transactional email).
          Each only receives what it needs to do its job. We share data with authorities only when legally required.
        </p>
      </div>
      <div className="block">
        <h2>5. Retention and deletion</h2>
        <p>
          Profile data is kept until you delete your account from your dashboard, which removes your profile, email, presence, interests and ratings.
          Support commitments remain as anonymous history on the sprint record. You can also ask us to delete data by email.
        </p>
      </div>
      <div className="block">
        <h2>6. Your rights</h2>
        <p>
          You can access, correct or delete your data from your dashboard, or by writing to {CONTACT_EMAIL}. Users in India have the rights set out in the
          Digital Personal Data Protection Act, 2023. We respond within 30 days.
        </p>
      </div>
      <div className="block">
        <h2>7. Cookies and storage</h2>
        <p>
          BidFund uses browser local storage for your session token and small preferences (for example, whether you have seen the onboarding tips). No
          third-party advertising cookies are set.
        </p>
      </div>
      <div className="block">
        <h2>8. Children</h2>
        <p>BidFund is for people aged 18 and over. We do not knowingly collect data from children.</p>
      </div>
    </>
  );
}

function Refunds() {
  return (
    <>
      <p className="sub">How cancellations and refunds work on BidFund, now and once real payments are switched on.</p>
      <div className="block">
        <h2>1. Pilot phase (now)</h2>
        <p>
          All commitments are simulated and no money changes hands, so there is nothing to refund. You can stop supporting at any time simply by not
          confirming further commitments.
        </p>
      </div>
      <div className="block">
        <h2>2. When real payments are live</h2>
        <ul className="proof">
          <li>
            <span>
              <b>Cancelling before the sprint closes.</b> You may cancel a confirmed commitment any time while the sprint is still live from your dashboard.
              The full amount is refunded to the original payment method. Any limited builder condition you claimed is released.
            </span>
          </li>
          <li>
            <span>
              <b>Sprint does not reach its goal.</b> If a sprint closes without reaching its goal and the builder has not chosen to proceed with partial
              funding, every commitment is refunded in full automatically.
            </span>
          </li>
          <li>
            <span>
              <b>Sprint reaches its goal.</b> Commitments become final when the sprint closes and funds are released to the builder. After that point,
              refunds are at the builder's discretion, except where a builder condition is not delivered as described.
            </span>
          </li>
          <li>
            <span>
              <b>Builder condition not delivered.</b> If a builder does not deliver a condition within the time stated in the listing (or 90 days if none
              was stated), contact us. We will work with the builder and, where warranted, refund the amount attributable to that condition.
            </span>
          </li>
          <li>
            <span>
              <b>Duplicate or mistaken payments</b> are refunded in full. Write to us with the reference shown on your receipt.
            </span>
          </li>
        </ul>
      </div>
      <div className="block">
        <h2>3. Timelines</h2>
        <p>
          Approved refunds are issued within 7 working days. Depending on your bank or card issuer, the amount may take a further 5 to 10 working days to
          appear. Payment gateway fees on refunded amounts are borne by BidFund, not by you.
        </p>
      </div>
      <div className="block">
        <h2>4. How to request a refund</h2>
        <p>
          Email {CONTACT_EMAIL} or use the <a href="/contact">contact page</a> with your username, the sprint name and the reference code from your receipt.
          We reply within 3 working days.
        </p>
      </div>
    </>
  );
}

function Shipping() {
  return (
    <>
      <p className="sub">BidFund itself ships nothing. This policy explains what happens to physical builder conditions and to the build itself.</p>
      <div className="block">
        <h2>1. Digital delivery</h2>
        <p>
          Your confirmation, receipt and sprint link are delivered instantly on the site and by email to the address you entered. There is no physical
          product from BidFund.
        </p>
      </div>
      <div className="block">
        <h2>2. Builder conditions (perks)</h2>
        <p>
          Some builders offer conditions such as a pilot unit, a name on the build, a workshop visit or early access. These are offered and fulfilled by
          the builder, not by BidFund. The listing states what is offered, any quantity limit, and when the builder expects to deliver it. Where a
          condition is a physical item, the builder ships it within India unless the listing says otherwise, and any shipping cost is included in the
          minimum amount unless the listing states a separate charge.
        </p>
      </div>
      <div className="block">
        <h2>3. Timelines</h2>
        <p>
          Delivery dates for builder conditions are estimates set by the builder. Hardware pilots can slip. Builders are expected to post progress updates
          on the sprint page, and BidFund will contact a builder on your behalf if a condition is more than 30 days late. If it is not delivered within the
          stated window (or 90 days if none was stated), the <a href="/refunds">refund policy</a> applies.
        </p>
      </div>
      <div className="block">
        <h2>4. Address and contact details</h2>
        <p>
          If a condition needs a delivery address, the builder will ask you for it directly through the contact details on your profile or by email. Give
          address details only to the builder of the sprint you backed. BidFund never asks for your address.
        </p>
      </div>
    </>
  );
}
