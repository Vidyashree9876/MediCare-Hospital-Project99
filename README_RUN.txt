MediCare — AI-Based FAQ Chatbot for Hospital Enquiry

RUN LOCALLY
1. Extract this ZIP.
2. Open the hospital_project folder in VS Code.
3. Open a terminal in this folder.
4. Run: npm install
5. Run: npm start
6. Open: http://localhost:3001

IMPORTANT
- Existing database.db, hospital.db and .env are included and preserved from the supplied project.
- Do not share your .env file publicly. GEMINI_API_KEY, EMAIL_USER and EMAIL_PASS are blank in the supplied file; add your own valid values only if you want Gemini fallback and email delivery to work.
- Gemini is optional. Predefined MediCare questions are answered by local FAQ rules without an API key. Gemini helps interpret unfamiliar wording, but must not be treated as a source of verified hospital facts.
- Appointment details are looked up from database.db only when the user provides the registered mobile number. Do not enter an OTP or password into the chatbot.
- The current database schema does not include a cancellation/status field or the complete doctor schedule. The chatbot therefore cannot confirm cancellation status or guarantee an unlisted time is free. It checks recorded bookings and directs users to the Book Appointment page/reception when needed.
- Cancellation instructions tell patients to follow the cancellation instructions in their confirmation email. Rescheduling still requires reception confirmation.
- This project was syntax-checked with `node --check server.js`. A full live test could not be completed in this build environment because the ZIP's bundled sqlite3 native binary is incompatible with this operating system. Running `npm install` on your own machine should install the appropriate dependency for your environment.


CHATBOT FAQ DATABASE
The 42 predefined chatbot question-answer pairs are saved in the SQLite table `chatbot_faqs` inside `database.db`. On first startup, the app seeds any missing questions into that table, then reads saved pairs from the database for exact-match answers. Existing appointments remain in the same database.


NEW: ABOUT, CONTACT AND PATIENT ENQUIRY PAGES
- About and Contact pages are available from the navigation menu.
- Contact phone/email are demo placeholders and MUST be replaced with verified hospital contact details before public use.
- Patient enquiries are saved in database.db (patient_enquiries table).
- Staff can log into Admin, review enquiries, write a response and save it. The response is marked Answered.
- To email patients and receive staff notification emails, configure EMAIL_USER and EMAIL_PASS in .env. If not configured, enquiries and replies are still saved in the database.
- Demo admin credentials shown by the existing project: admin / admin123. Change this before any real deployment; this project login is for demonstration only.
- The chatbot now handles greetings, exact saved FAQ answers, and common natural-language variations using only the project's saved FAQs and verified hospital information. If Gemini is configured, it is used only as a restricted fallback; it is instructed not to invent hospital facts.
- The Patient Enquiry form no longer displays a Subject box. The project automatically creates an internal subject from the selected enquiry type, so the existing Admin panel and database continue to work without changing their structure.
