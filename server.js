const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// GEMINI AI
// ==========================================

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || ''
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// SQLITE DATABASE
// ==========================================

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('✅ SQLite Database connected/created.');
    }
});

// ==========================================
// DATABASE TABLES
// ==========================================

db.serialize(() => {

    db.run(`CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_name TEXT,
        age INTEGER,
        gender TEXT,
        email TEXT,
        phone TEXT,
        doctor TEXT,
        appointment_date TEXT,
        appointment_time TEXT,
        reason TEXT
    )`);

    db.run(`ALTER TABLE appointments ADD COLUMN gender TEXT`, () => {});
    db.run(`ALTER TABLE appointments ADD COLUMN status TEXT DEFAULT 'Booked'`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS unanswered_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_question TEXT,
        asked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS patient_enquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        response TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        responded_at DATETIME
    )`);
});

// ==========================================
// EMAIL CONFIGURATION
// ==========================================

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ==========================================
// FAQ DATA
// ==========================================

const commonFaqs = [
    {
        id: 1,
        question: "What are the hospital OPD timings?",
        answer: "Dr. Sarah Sharma: Mon–Sat (9 AM–2 PM) | Dr. Priya Patel: Mon–Fri (10 AM–4 PM) | Dr. Rajesh Kumar: Tue–Sun (11 AM–5 PM)."
    },
    {
        id: 2,
        question: "What are the doctor consultation fees?",
        answer: "Dr. Sarah Sharma (General Medicine): ₹500 | Dr. Priya Patel (Gynecologist): ₹600 | Dr. Rajesh Kumar (Orthopedic): ₹500."
    },
    {
        id: 3,
        question: "How do I book an appointment online?",
        answer: "Click 'Book Appointment', enter patient details with a valid 10-digit mobile number, choose doctor & time slot, and submit."
    },
    {
        id: 4,
        question: "Where is MediCare Hospital located?" ,
        answer: "Near MG Petrol Bank, Batwadi, Tumakur, Karnataka 572103."
    },
    {
        id: 5,
        question: "Are emergency services available 24/7?",
        answer: "Yes, our Casualty and Emergency department operates 24 hours a day, 7 days a week."
    },
    {
        id: 6,
        question: "Is parking available at the hospital?",
        answer: "Yes, free dedicated parking for both two-wheelers and four-wheelers is available on-site."
    },
    {
        id: 7,
        question: "Do you accept health insurance / cashless TPA?",
        answer: "Yes, we support major health insurance policies. Please present your policy card at the main reception."
    },
    {
        id: 8,
        question: "What documents should I bring for my visit?",
        answer: "Please bring a valid photo ID and any past medical records/prescriptions."
    },
    {
        id: 9,
        question: "How can I reschedule or cancel my booking?",
        answer: "Contact our front desk at least 2 hours before your slot to reschedule or cancel your appointment."
    },
    {
        id: 10,
        question: "Are diagnostic lab services available in-house?",
        answer: "Yes, blood tests, X-rays, and basic diagnostic services are conducted on premises."
    },
    {
        id: 11,
        question: "What payment methods are accepted?",
        answer: "We accept Cash, UPI (Google Pay, PhonePe, Paytm), and Credit/Debit cards at all counters."
    },
    {
        id: 12,
        question: "What are the ward visiting hours?",
        answer: "General ward visiting hours are from 4:00 PM to 7:00 PM daily (Max 2 visitors per patient)."
    },
    {
        id: 13,
        question: "Is there an in-house pharmacy?",
        answer: "Yes, our medical shop is attached to the hospital building for all prescribed medications."
    },
    {
        id: 14,
        question: "Are wheelchair facilities available?",
        answer: "Yes, wheelchairs and stretchers with assistant help are available at the main entrance."
    },
    {
        id: 15,
        question: "When are discharge summaries issued?",
        answer: "Discharge summaries and prescription guides are issued at the billing desk upon doctor clearance."
    }
];

// ==========================================
// FAQ API
// ==========================================

app.get('/api/faqs', (req, res) => {
    res.json(commonFaqs);
});

// ==========================================
// BOOK APPOINTMENT
// ==========================================

app.post('/api/appointments', (req, res) => {

    const {
        patient_name,
        age,
        gender,
        email,
        phone,
        doctor,
        appointment_date,
        appointment_time,
        reason
    } = req.body;

    const phoneRegex = /^[789]\d{9}$/;

    if (!phone || !phoneRegex.test(phone.toString().trim())) {
        return res.status(400).json({
            error: 'Invalid phone number. Please enter a valid 10-digit mobile number starting with 7, 8, or 9.'
        });
    }

    const checkQuery = `
        SELECT * FROM appointments
        WHERE doctor = ?
        AND appointment_date = ?
        AND appointment_time = ?
        AND (status IS NULL OR status != 'Cancelled')
    `;

    db.get(
        checkQuery,
        [doctor, appointment_date, appointment_time],
        (checkErr, existingSlot) => {

            if (checkErr) {
                console.error(checkErr);

                return res.status(500).json({
                    error: 'Database check failed.'
                });
            }

            if (existingSlot) {
                return res.status(400).json({
                    error: 'That time slot is already booked for this doctor. Please choose a different date or time.'
                });
            }

            const insertQuery = `
                INSERT INTO appointments
                (
                    patient_name,
                    age,
                    gender,
                    email,
                    phone,
                    doctor,
                    appointment_date,
                    appointment_time,
                    reason
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.run(
                insertQuery,
                [
                    patient_name,
                    age,
                    gender,
                    email,
                    phone,
                    doctor,
                    appointment_date,
                    appointment_time,
                    reason
                ],
                function (err) {

                    if (err) {
                        console.error(err);

                        return res.status(500).json({
                            error: 'Database error while saving appointment.'
                        });
                    }

                    const appointmentId = this.lastID;
                    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
                    const cancelUrl = `${baseUrl}/api/cancel-appointment/${appointmentId}`;

                    const mailOptions = {
                        from: `"MediCare Health System" <${process.env.EMAIL_USER}>`,
                        to: email,
                        subject: 'Appointment Confirmation - MediCare Health System',

                        text:
                            `Hello ${patient_name}, your appointment with ${doctor} on ${appointment_date} at ${appointment_time} is confirmed. ` +
                            `Phone: ${phone}. Reason: ${reason}. ` +
                            `Location: Near MG Petrol Bank, Batwadi, Tumakur, Karnataka 572103. ` +
                            `Thank you for choosing MediCare Hospital! To cancel your appointment, open: ${cancelUrl}`,

                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #e0e0e0; border-radius: 8px;">

                                <h2 style="color: #0066ff; margin-top: 0;">
                                    MediCare Appointment Confirmation
                                </h2>

                                <p>Dear <strong>${patient_name}</strong>,</p>

                                <p>
                                    Your appointment has been successfully scheduled.
                                    Here are your booking details:
                                </p>

                                <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border: 1px solid #ddd;">

                                    <tr style="background-color: #f9f9f9;">
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Doctor / Department:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            ${doctor}
                                        </td>
                                    </tr>

                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Date:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            ${appointment_date}
                                        </td>
                                    </tr>

                                    <tr style="background-color: #f9f9f9;">
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Time:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            ${appointment_time}
                                        </td>
                                    </tr>

                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Age / Gender:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            ${age} years | ${gender}
                                        </td>
                                    </tr>

                                    <tr style="background-color: #f9f9f9;">
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Phone:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            ${phone}
                                        </td>
                                    </tr>

                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Reason for Visit:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            ${reason}
                                        </td>
                                    </tr>

                                    <tr style="background-color: #f9f9f9;">
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            <strong>Address:</strong>
                                        </td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">
                                            Near MG Petrol Bank, Batwadi, Tumakur, Karnataka 572103
                                        </td>
                                    </tr>

                                </table>

                                <br>

                                <div style="text-align: center; margin: 20px 0;">
                                    <a href="${cancelUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                                        Cancel Appointment
                                    </a>
                                </div>

                                <p style="text-align: center; color: #666; font-size: 13px;">
                                    If you want to cancel your appointment, click the Cancel Appointment button above.
                                </p>

                                <p>
                                    Thank you for choosing MediCare Hospital!
                                </p>

                            </div>
                        `
                    };

                    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && email) {

                        transporter.sendMail(
                            mailOptions,
                            (mailErr, info) => {

                                if (mailErr) {
                                    console.log(
                                        'Email Note:',
                                        mailErr.message
                                    );
                                } else {
                                    console.log(
                                        'Email sent:',
                                        info.response
                                    );
                                }

                            }
                        );

                    } else {

                        console.log(
                            'Email not sent: EMAIL_USER or EMAIL_PASS is missing in .env'
                        );

                    }

                    res.json({
                        success: true,
                        id: this.lastID
                    });

                }
            );
        }
    );
});

// ==========================================
// CANCEL APPOINTMENT FROM EMAIL
// ==========================================

app.get('/api/cancel-appointment/:id', (req, res) => {

    const appointmentId = req.params.id;

    db.get(
        `SELECT * FROM appointments WHERE id = ?`,
        [appointmentId],
        (err, appointment) => {

            if (err) {
                console.error(err);
                return res.status(500).send('Database error. Please try again.');
            }

            if (!appointment) {
                return res.status(404).send(`
                    <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2>Appointment not found</h2>
                    </div>
                `);
            }

            if (appointment.status === 'Cancelled') {
                return res.send(`
                    <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #dc3545;">Appointment Already Cancelled</h2>
                        <p>This appointment has already been cancelled.</p>
                    </div>
                `);
            }

            db.run(
                `UPDATE appointments SET status = 'Cancelled' WHERE id = ?`,
                [appointmentId],
                (updateErr) => {

                    if (updateErr) {
                        console.error(updateErr);
                        return res.status(500).send('Could not cancel the appointment. Please try again.');
                    }

                    // Send cancellation confirmation email to the patient.
                    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && appointment.email) {

                        const cancellationMailOptions = {
                            from: `"MediCare Health System" <${process.env.EMAIL_USER}>`,
                            to: appointment.email,
                            subject: 'Appointment Cancellation Confirmation - MediCare Health System',
                            text:
                                `Hello ${appointment.patient_name}, your appointment with ${appointment.doctor} on ${appointment.appointment_date} at ${appointment.appointment_time} has been cancelled successfully. Thank you for choosing MediCare Hospital.`,
                            html: `
                                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #e0e0e0; border-radius: 8px;">
                                    <h2 style="color: #dc3545; margin-top: 0;">Appointment Cancelled</h2>
                                    <p>Dear <strong>${appointment.patient_name}</strong>,</p>
                                    <p>Your appointment has been <strong>cancelled successfully</strong>.</p>
                                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; border: 1px solid #ddd;">
                                        <tr>
                                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Doctor / Department:</strong></td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${appointment.doctor}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date:</strong></td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${appointment.appointment_date}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Time:</strong></td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${appointment.appointment_time}</td>
                                        </tr>
                                    </table>
                                    <p style="margin-top: 20px;">A cancellation confirmation has been recorded for your appointment.</p>
                                    <p>Thank you for choosing MediCare Hospital!</p>
                                </div>
                            `
                        };

                        transporter.sendMail(cancellationMailOptions, (mailErr, info) => {
                            if (mailErr) {
                                console.log('Cancellation email note:', mailErr.message);
                            } else {
                                console.log('Cancellation email sent:', info.response);
                            }
                        });
                    }

                    res.send(`
                        <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                            <h2 style="color: #dc3545;">Appointment Cancelled Successfully</h2>
                            <p>Your appointment has been cancelled.</p>
                            <p>A cancellation confirmation has been sent to your email address.</p>
                            <p>You can book a new appointment anytime.</p>
                        </div>
                    `);
                }
            );
        }
    );
});

// ==========================================
// ADMIN APPOINTMENTS
// ==========================================

app.get('/api/admin/appointments', (req, res) => {

    db.all(
        `SELECT * FROM appointments ORDER BY id DESC`,
        [],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(rows);
        }
    );
});

// ==========================================
// ADMIN UNANSWERED QUESTIONS
// ==========================================

app.get('/api/admin/unanswered-questions', (req, res) => {

    db.all(
        `SELECT * FROM unanswered_questions ORDER BY id DESC`,
        [],
        (err, rows) => {

            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            res.json(rows);
        }
    );
});

// =====================================================
// MEDICARE AI CHATBOT — FAQ-FIRST + AI FALLBACK
// =====================================================
const chatbotKnowledge = [
 {keys:['location','address','where are you','located','direction','reach hospital','map'],answer:'MediCare Hospital is near MG Petrol Bank, Batwadi, Tumakuru, Karnataka 572103.'},
 {keys:['opd','timing','opening time','working hours','hospital hours','when open','close time'],answer:'Doctor OPD timings: Dr. Sarah Sharma (General Medicine), Monday–Saturday, 9 AM–2 PM; Dr. Priya Patel (Gynecology), Monday–Friday, 10 AM–4 PM; Dr. Rajesh Kumar (Orthopedics), Tuesday–Sunday, 11 AM–5 PM.'},
 {keys:['emergency','urgent','casualty','24 hour','24/7','accident'],answer:'MediCare Hospital’s Casualty and Emergency department is listed as open 24 hours a day, 7 days a week. For a life-threatening emergency, seek immediate local emergency help.'},
 {keys:['appointment','book doctor','booking','schedule visit','reserve slot','online appointment'],answer:'To request an appointment, open the “Book Appointment” section, enter the patient details, provide a valid 10-digit mobile number, choose a doctor and available time slot, and submit the form. This chat does not book appointments.'},
 {keys:['cancel appointment','cancellation','cancel my booking','reschedule','change appointment'],answer:'For cancellation, follow the cancellation instructions in the confirmation email sent to your email address. For rescheduling, contact MediCare reception and wait for confirmation before assuming the change is complete.'},
 {keys:['fee','fees','consultation charge','consultation cost','doctor charge','how much'],answer:'Listed consultation fees: Dr. Sarah Sharma (General Medicine) ₹500; Dr. Priya Patel (Gynecology) ₹600; Dr. Rajesh Kumar (Orthopedics) ₹500.'},
 {keys:['general medicine','general physician','fever doctor','cold doctor','general checkup','physician'],answer:'Dr. Sarah Sharma is listed under General Medicine and is available Monday–Saturday, 9 AM–2 PM. The consultation fee is ₹500. For symptoms, the doctor must assess you directly.'},
 {keys:['gynecologist','gynecology','gynaecologist','pregnancy','period problem','women doctor','women specialist'],answer:'Dr. Priya Patel is listed under Gynecology and is available Monday–Friday, 10 AM–4 PM. The consultation fee is ₹600.'},
 {keys:['orthopedic','orthopaedic','bone doctor','joint pain','back pain doctor','fracture doctor'],answer:'Dr. Rajesh Kumar is listed under Orthopedics and is available Tuesday–Sunday, 11 AM–5 PM. The consultation fee is ₹500. For severe or sudden symptoms, seek urgent medical assessment.'},
 {keys:['doctor name','doctors available','list of doctors','specialist','which doctors'],answer:'The listed doctors are Dr. Sarah Sharma (General Medicine), Dr. Priya Patel (Gynecology), and Dr. Rajesh Kumar (Orthopedics). Please check the Doctors section for displayed details.'},
 {keys:['sunday','open on sunday'],answer:'Dr. Rajesh Kumar (Orthopedics) is listed as available Sunday, 11 AM–5 PM. The other listed doctors’ schedules do not include Sunday.'},
 {keys:['saturday'],answer:'Dr. Sarah Sharma (General Medicine) is listed Saturday, 9 AM–2 PM. Dr. Rajesh Kumar (Orthopedics) is listed Tuesday–Sunday, 11 AM–5 PM.'},
 {keys:['insurance','cashless','tpa','health insurance'],answer:'MediCare lists support for major health insurance policies and cashless TPA. Present your policy card at reception to confirm coverage.'},
 {keys:['document','documents','bring with me','id proof','medical records','prescription'],answer:'Please bring a valid photo ID and any previous medical records or prescriptions.'},
 {keys:['parking','park vehicle','two wheeler','four wheeler'],answer:'Free on-site parking for two-wheelers and four-wheelers is listed as available.'},
 {keys:['lab','laboratory','blood test','test available','diagnostic','x-ray','xray'],answer:'The hospital lists in-house blood tests, X-rays, and basic diagnostic services. Contact the hospital to confirm a specific test and its price.'},
 {keys:['pharmacy','medical shop','medicine shop','medicines available'],answer:'An in-house medical shop is listed as attached to the hospital building. Medicines should be taken as prescribed by a qualified clinician.'},
 {keys:['payment','pay by','upi','google pay','phonepe','paytm','card','cash'],answer:'Listed payment methods are cash, UPI (Google Pay, PhonePe, Paytm), and credit/debit cards at the counters.'},
 {keys:['visiting hours','visit patient','patient visiting','ward visiting','visitor'],answer:'General ward visiting hours are listed as 4 PM–7 PM daily, with a maximum of two visitors per patient.'},
 {keys:['wheelchair','stretcher','disabled','accessibility','mobility help'],answer:'Wheelchairs and stretchers, with assistant help, are listed as available at the main entrance.'},
 {keys:['discharge summary','discharge paper','discharge document'],answer:'Discharge summaries and prescription guides are issued at the billing desk after the doctor clears the patient for discharge.'},
 {keys:['contact number','phone number','telephone','email address','contact hospital'],answer:'I do not have a verified hospital phone number or email address in my current information. Please check the hospital’s official contact details or ask at the front desk.'},
 {keys:['room rent','bed charges','admission','icu','ward charges','hospital charges'],answer:'I do not have verified room, bed, ICU, or admission charges in the current MediCare information. Please contact the hospital front desk.'},
 {keys:['ambulance'],answer:'I do not have verified ambulance availability or contact details in the current MediCare information. For an emergency, contact local emergency services immediately.'},
 {keys:['covid','vaccination','vaccine'],answer:'I do not have confirmed information about current vaccination services. Please contact the hospital front desk to check availability.'},
 {keys:['appointment confirmed','confirm appointment','did my appointment book','booking status','appointment status'],answer:'I cannot verify appointment status from this chat. Please check the message shown after submitting the Book Appointment form or contact the hospital front desk.'},
 {keys:['appointment time','available slot','available timings','time slot available','doctor availability'],answer:'Please open the Book Appointment page to view the available time slots. The chatbot cannot confirm live slot availability.'},
 {keys:['how early arrive','when should i arrive','arrive before appointment','reporting time'],answer:'Please arrive a little before your selected appointment time so you can complete registration. Carry a photo ID and previous medical records.'},
 {keys:['registration','register patient','new patient','first visit','patient registration'],answer:'For a visit, bring a valid photo ID and previous medical records if available. Ask the reception team about any registration forms or fees.'},
 {keys:['child doctor','pediatrician','paediatrician','baby doctor','children doctor'],answer:'A pediatrician is not listed in the verified MediCare doctor information available to me. Please contact reception to confirm whether child-care services are available.'},
 {keys:['heart doctor','cardiologist','heart specialist','cardiology'],answer:'A cardiologist is not listed in the verified MediCare doctor information available to me. Please contact reception to confirm specialist availability. For chest pain or severe breathing difficulty, seek emergency care immediately.'},
 {keys:['skin doctor','dermatologist','skin specialist'],answer:'A dermatologist is not listed in the verified MediCare doctor information available to me. Please contact reception to check specialist availability.'},
 {keys:['eye doctor','ophthalmologist','eye specialist'],answer:'An eye specialist is not listed in the verified MediCare doctor information available to me. Please contact reception to check availability.'},
 {keys:['dentist','dental','tooth doctor','teeth treatment'],answer:'Dental services are not confirmed in the information available to this chatbot. Please contact the hospital front desk to check.'},
 {keys:['ent doctor','ear nose throat','ent specialist'],answer:'An ENT specialist is not listed in the verified MediCare doctor information available to me. Please contact reception to confirm availability.'},
 {keys:['surgeon','surgery','operation','surgical treatment'],answer:'I do not have verified details about surgical services or surgeons at MediCare. Please contact the hospital directly for confirmation.'},
 {keys:['maternity','delivery','labour room','childbirth','normal delivery','c section'],answer:'I cannot confirm maternity, delivery, or labour-room services from the verified information available to me. Please contact the hospital front desk.'},
 {keys:['admission process','how to get admitted','inpatient','admit patient'],answer:'For admission, please speak with the hospital reception or treating doctor. I do not have verified admission procedures or bed availability.'},
 {keys:['bed availability','beds available','room available','icu bed available'],answer:'I cannot check live bed, room, or ICU availability. Please contact the hospital directly, especially if the situation is urgent.'},
 {keys:['lab report','test report','blood report','xray report','results ready','report collection'],answer:'Report turnaround times and collection details are not available in my verified information. Please ask the laboratory or reception using your test receipt.'},
 {keys:['lab test price','blood test cost','xray price','test charges','diagnostic charges'],answer:'I do not have verified prices for individual laboratory tests or X-rays. Please confirm the test name and current price with the laboratory or reception.'},
 {keys:['fasting before test','fast before blood test','empty stomach','prepare for blood test'],answer:'Preparation depends on the specific test. Please follow the instructions from your doctor or laboratory; do not assume fasting is required for every test.'},
 {keys:['health checkup','full body checkup','master health checkup','preventive checkup'],answer:'Basic diagnostic services are listed, but I do not have a verified list or price for health-checkup packages. Please contact reception for current options.'},
 {keys:['prescription refill','repeat prescription','medicine without prescription','need medicine'],answer:'The hospital lists an attached pharmacy. Please ask a qualified clinician or pharmacist about your specific medicine; do not start or change medication based only on chatbot advice.'},
 {keys:['medicine dosage','how many tablets','which medicine','what medicine should i take','medical advice'],answer:'I cannot diagnose conditions or recommend medicines or dosages. Please consult a qualified healthcare professional. If symptoms are severe or life-threatening, seek emergency care.'},
 {keys:['fever treatment','cold treatment','headache treatment','stomach pain treatment'],answer:'I cannot diagnose symptoms or recommend a treatment through chat. You can request a General Medicine appointment with Dr. Sarah Sharma, or seek urgent care if symptoms are severe.'},
 {keys:['medical certificate','fitness certificate','sick leave certificate'],answer:'I do not have verified information about medical or fitness certificate services. Please ask the hospital reception or your treating doctor.'},
 {keys:['insurance documents','insurance claim','claim form','cashless approval','insurance accepted'],answer:'MediCare lists support for major health insurance policies and cashless TPA, but acceptance depends on your policy and approval. Bring your policy card and confirm coverage with reception before treatment.'},
 {keys:['refund','payment refund','refund appointment','cancel fee'],answer:'I do not have a verified refund or cancellation-fee policy. Please contact the hospital billing desk or front desk for the applicable rules.'},
 {keys:['bill copy','duplicate bill','invoice','billing query','receipt'],answer:'For a bill copy, invoice, or payment receipt, please contact the hospital billing counter and keep your visit or payment details available.'},
 {keys:['attendant','stay with patient','one attendant','patient companion'],answer:'The confirmed visiting rule for general wards is 4 PM–7 PM daily, with a maximum of two visitors per patient. I do not have verified overnight-attendant rules; please ask the ward staff.'},
 {keys:['wheelchair at entrance','help elderly','elderly assistance','mobility assistance'],answer:'Wheelchairs and stretchers with assistant help are listed as available at the main entrance. Ask the entrance staff for assistance.'},
 {keys:['hospital holiday','public holiday','holiday timings','closed today'],answer:'I do not have a verified holiday schedule. Please confirm with the hospital front desk before travelling.'},
 {keys:['email appointment','book by phone','appointment by call','contact to book'],answer:'I do not have a verified hospital phone number or email address. You can use the Book Appointment section on this website or check the hospital’s official contact details.'},
 {keys:['covid precautions','mask required','infection control','visitor rules'],answer:'I do not have verified current mask or infection-control rules. Please follow instructions displayed at the hospital and check with staff when you arrive.'},
 {keys:['ambulance number','call ambulance','need ambulance','emergency phone'],answer:'I do not have a verified MediCare ambulance number or ambulance-availability status. For an emergency in India, call 112 or your local emergency service.'},
 {keys:['pregnancy doctor','pregnant','menstrual','period issue','women health'],answer:'Dr. Priya Patel is listed under Gynecology, Monday–Friday, 10 AM–4 PM, with a listed consultation fee of ₹600. Please book through the Book Appointment page. For urgent pregnancy symptoms, seek immediate medical care.'},
 {keys:['bone fracture','broken bone','injury orthopedics','joint specialist'],answer:'Dr. Rajesh Kumar is listed under Orthopedics, Tuesday–Sunday, 11 AM–5 PM, with a listed consultation fee of ₹500. For a serious injury or suspected fracture, seek urgent medical assessment rather than waiting for a routine appointment.'},
 {keys:['general checkup fee','general physician fee','medicine doctor fee'],answer:'Dr. Sarah Sharma (General Medicine) has a listed consultation fee of ₹500 and is available Monday–Saturday, 9 AM–2 PM.'},
 {keys:['gynecologist fee','gynecology fee','women doctor fee'],answer:'Dr. Priya Patel (Gynecology) has a listed consultation fee of ₹600 and is available Monday–Friday, 10 AM–4 PM.'},
 {keys:['orthopedic fee','bone doctor fee','orthopaedic fee'],answer:'Dr. Rajesh Kumar (Orthopedics) has a listed consultation fee of ₹500 and is available Tuesday–Sunday, 11 AM–5 PM.'},
 {keys:['thank you','thanks','thank you so much'],answer:'You’re welcome! I’m happy to help with MediCare Hospital information.'},
 {keys:['hello','hi','hey','good morning','good afternoon','good evening'],answer:'Hello! I’m MediCare’s hospital information assistant. Ask about doctors, OPD timings, consultation fees, appointments, emergency services, insurance, tests, pharmacy, parking, or visiting hours.'},
 {keys:['thank you','thanks','thank you so much'],answer:'You’re welcome! I’m happy to help with MediCare Hospital information.'}
];
// Additional realistic patient questions beyond the original FAQ list.
// Answers are limited to the three departments and verified project details.
const additionalPatientKnowledge = [
 {keys:['knee pain','pain in my knee','my knees hurt','knee problem'],answer:'For knee pain, you can contact the Orthopedics department. Dr. Rajesh Kumar is listed for Orthopedics, Tuesday–Sunday, 11 AM–5 PM; the listed consultation fee is ₹500. If the pain is severe or follows a serious injury, seek urgent medical care.'},
 {keys:['joint pain','pain in my joints','joint problem','bone pain','bones hurt'],answer:'The Orthopedics department can assess bone and joint concerns. Dr. Rajesh Kumar is listed Tuesday–Sunday, 11 AM–5 PM, with a consultation fee of ₹500. The doctor will assess your symptoms and advise what is appropriate.'},
 {keys:['which doctor for fever','i have fever','fever since yesterday','cold and fever','general health checkup','routine health checkup'],answer:'You can contact General Medicine. Dr. Sarah Sharma is listed Monday–Saturday, 9 AM–2 PM, with a consultation fee of ₹500. If symptoms are severe or rapidly worsening, seek urgent medical care.'},
 {keys:['womens health','women health consultation','lady doctor','gynecologist','gynecologist appointment','gynecology doctor'],answer:'MediCare lists Dr. Priya Patel in the Gynecology department, Monday–Friday, 10 AM–4 PM. The listed consultation fee is ₹600. Use the Book Appointment section to request a visit.'},
 {keys:['not sure which doctor','which doctor should i choose','help me choose a department','which department should i visit','i dont know which doctor'],answer:'MediCare currently lists General Medicine, Gynecology and Orthopedics. General Medicine is a starting point for general health concerns; Gynecology is for women’s reproductive health; Orthopedics is for bone and joint concerns. If you are unsure, contact reception for guidance. For emergencies, seek immediate care.'},
 {keys:['forgot appointment time','forgot the time','when is my appointment','check my appointment time'],answer:'I cannot view personal appointment records in this chat. Please check your confirmation message or contact the hospital reception with the name and phone number used for booking.'},
 {keys:['change appointment day','change my appointment','move my appointment','reschedule my booking','i will be late','running late for appointment'],answer:'Please contact the hospital front desk to request a change or ask whether a late arrival can be accommodated. For cancellation or rescheduling, the project information asks patients to contact the front desk at least 2 hours before the appointment.'},
 {keys:['book for family member','appointment for my mother','appointment for my father','book appointment for someone else'],answer:'You can use the Book Appointment page to submit the patient’s details and select a doctor. Enter the patient’s correct information. This chatbot cannot submit or confirm a booking for you.'},
 {keys:['booking confirmation not received','no confirmation message','appointment message not received','booking submitted but no message'],answer:'If you submitted the booking form but did not receive confirmation, please check your contact details and contact the hospital reception to verify whether the appointment was recorded. This chatbot cannot access booking status.'},
 {keys:['same day appointment','appointment today','can i see doctor today','walk in appointment'],answer:'Same-day availability is not confirmed in this chatbot. Please check the Book Appointment page or contact reception to confirm the doctor’s availability before visiting.'},
 {keys:['dizzy','feeling dizzy','persistent cough','cough for days','symptoms getting worse','getting worse'],answer:'I cannot diagnose symptoms through chat. For a persistent cough or dizziness, contact General Medicine (Dr. Sarah Sharma, listed Monday–Saturday, 9 AM–2 PM; consultation fee ₹500) for assessment. If symptoms are severe, sudden or rapidly worsening, seek urgent medical care immediately.'},
 {keys:['medical emergency','emergency help','urgent medical help','life threatening emergency'],answer:'MediCare Hospital provides emergency service 24 hours a day,7 days a week. For a life-threatening emergency, seek immediate emergency medical help or call your local emergency number.'},
 {keys:['hospital admission','how to get admitted','admission process','patient admission'],answer:'For admission eligibility, required documents and bed arrangements, please contact the hospital reception or treating doctor. This chatbot cannot confirm admission or bed availability.'},
 {keys:['bed available','bed availability','icu bed','is an icu bed available'],answer:'Live bed and ICU availability is not available in this chatbot. Please contact the hospital directly to confirm current availability. If this is an emergency, seek immediate emergency care.'},
 {keys:['elderly patient','old age patient','senior citizen assistance'],answer:'yes,Medicare Hospital provides wheelchairs and stretchers at the entrance. For any additional assistance for an elderly patient, please contact reception before your visit.'},
 {keys:['family member accompany','can someone come with me','visitor policy','visiting hours','visit a patient'],answer:'The Medicare Hospital provides visiting hours are daily from 4 PM to 7 PM, with a maximum of two visitors. Please confirm any special circumstances with reception.'},
 {keys:['lost something','lost item','lost property','forgot my bag'],answer:'Please contact the hospital reception and describe the item and where you may have left it. This chatbot cannot check the hospital’s lost-and-found records.'},
 {keys:['discharge process','patient discharge','discharge papers'],answer:'For discharge timing, instructions and documents, please speak with the treating team or hospital reception. Discharge decisions must come from the clinical team.'},
 {keys:['correct appointment details','wrong details in form','entered wrong details','edit booking details','update phone number'],answer:'Please contact hospital reception to request a correction to your appointment details. Do not share sensitive medical or identity information in this chat.'},
 {keys:['medical records copy','copy of medical records','previous records','get my records'],answer:'Please contact the hospital reception or medical records desk to ask about the process and identity verification required to obtain records. This chatbot cannot retrieve private medical records.'},
 {keys:['question about bill','billing issue','duplicate bill','copy of bill','receipt after payment','payment receipt'],answer:'For billing questions, duplicate bills or receipts, please contact the hospital billing desk or reception with your visit details. This chatbot cannot access individual bills.'},
 {keys:['appointment cancelled','check cancellation','was my appointment cancelled','cancelled booking status'],answer:'I cannot view cancellation status in this chat. Please check any confirmation message or contact reception to verify the status of your appointment.'},
 {keys:['feedback about visit','give feedback','complaint about hospital','share feedback'],answer:'You can share your feedback or complaint with the hospital reception or administration team. Please avoid posting private medical details in this chat.'},
 {keys:['help me book','book an appointment for me','can you book my appointment'],answer:'I can guide you, but I cannot book the appointment directly from this chat. Open the Book Appointment section, enter the patient details, choose one of the listed doctors and available slots, and submit the form.'},
 {keys:['show available doctors','list your doctors','what doctors are available','tell me about your doctors'],answer:' three doctors: Dr. Sarah Sharma — General Medicine, Monday–Saturday, 9 AM–2 PM, ₹500; Dr. Priya Patel — Gynecology, Monday–Friday, 10 AM–4 PM, ₹600; Dr. Rajesh Kumar — Orthopedics, Tuesday–Sunday, 11 AM–5 PM, ₹500.'},
 {keys:['hospital contact information','contact number','phone number of hospital','how can i contact reception'],answer:'yes,Medicare Hospital provides to this chatbot does not include a verified hospital phone number. Please use the contact details shown on the hospital’s official project page or ask the reception desk in person.'},
 {keys:['speak in simple english','simple english','cannot understand my question','you dont understand my question'],answer:'You can ask your question in simple words, for example: “I have knee pain. Which doctor should I see?” I will try to guide you using MediCare’s listed departments and hospital information.'},
 {keys:['blood test report online','check lab report','test report status','when will my report be ready'],answer:'yes,Medicare Hospital says blood tests and basic diagnostic services, but online report access and report timing are not confirmed. Please contact the diagnostic desk or reception for accurate information.'},
 {keys:['x ray cost','price of xray','how much is an x ray','test price','blood test price'],answer:'Specific test prices are not available in the verified information for this chatbot. Please contact the hospital diagnostic desk for current prices before your test.'},
 {keys:['maternity services','pregnancy services','pregnant','delivery services'],answer:'MediCare lists a Gynecology department, but maternity, delivery and inpatient services are not confirmed in the chatbot’s verified information. Please contact reception to confirm which services are available.'},
 {keys:['insurance claim','cashless approval','cashless insurance','do you accept insurance'],answer:'yes,Medicare Hospital says major health insurance and cashless TPA arrangements may be available, but coverage depends on the policy and approval. Please confirm your insurer, policy and cashless eligibility with reception before treatment.'},
 {keys:['pharmacy','medicine shop','in house pharmacy','buy medicines'],answer:'yes,Medicare Hospital provides an attached pharmacy. For medicine availability, pricing and prescription requirements, please ask the pharmacy staff. Do not start or change medication based on chatbot advice.'},
 {keys:['parking','car parking','two wheeler parking'],answer:'yes,Medicare Hospital provides free on-site for patirnts and visitors.'},
 {keys:['wheelchair','stretcher','mobility support','help walking'],answer:'yes,Medicare Hospital provides wheelchairs and stretchers at the entrance. Please ask the hospital staff for assistance when you arrive.'},
 {keys:['what documents bring','documents for appointment','photo id','what should i bring'],answer:'Please bring a photo ID and any relevant previous medical records, as listed in the project information. Ask reception whether any additional documents are required for your visit.'},
 {keys:['payment methods','pay by upi','credit card','debit card','do you accept upi'],answer:' yes,Medicare Hospital provides cash, UPI and credit/debit cards as payment methods. Please confirm accepted methods with billing if you have a specific payment concern.'},
 {keys:['parking location','where can i park'],answer:'yes,Medicare Hospital provides free on-site parking. Please follow the signs or ask security staff when you arrive.'},
 {keys:['is appointment booked','did you book my appointment','confirm my appointment'],answer:'I cannot confirm or create an appointment from this chat. Please check the booking page or contact reception to verify your appointment.'},
 {keys:['prescribe medicine','which medicine should i take','medicine for fever','what tablet should i take'],answer:'I cannot prescribe medicines or recommend a personal dose. Please consult a qualified healthcare professional or pharmacist. For severe or rapidly worsening symptoms, seek urgent medical care.'},
 {keys:['diagnose me','what disease do i have','tell me my disease'],answer:'I cannot diagnose a disease through this chatbot. A qualified healthcare professional needs to assess your symptoms and medical history. I can help you find the appropriate listed department.'}
];
chatbotKnowledge.push(...additionalPatientKnowledge);

// Exact-match answers for the 42 target patient questions. This list is kept
// inside the chatbot code so the other MediCare modules remain unchanged.
const exactPatientQuestions = [
 {q:'What are the hospital OPD timings?',a:'Doctor OPD timings: Dr. Sarah Sharma (General Medicine), Monday–Saturday, 9 AM–2 PM; Dr. Priya Patel (Gynecology), Monday–Friday, 10 AM–4 PM; Dr. Rajesh Kumar (Orthopedics), Tuesday–Sunday, 11 AM–5 PM.'},
 {q:'What are the doctor consultation fees?',a:'Listed consultation fees: Dr. Sarah Sharma (General Medicine) ₹500; Dr. Priya Patel (Gynecology) ₹600; Dr. Rajesh Kumar (Orthopedics) ₹500.'},
 {q:'How do I book an appointment online?',a:'Open Book Appointment, enter the patient details and valid 10-digit mobile number, choose one of the three listed doctors and an available time slot, then submit. A booking is not confirmed until the website confirms it.'},
 {q:'Where is MediCare Hospital located?',a:'MediCare Hospital is listed near MG Petrol Bank, Batwadi, Tumakuru, Karnataka 572103.'},
 {q:'Are emergency services available 24/7?',a:'Medicare Hospital provides emergency service as available 24/7. For a life-threatening emergency in India, call 112 or seek immediate emergency care.'},
 {q:'Is parking available at the hospital?',a:'Medicare Hospital provides free on-site parking for two-wheelers and four-wheelers.'},
 {q:'Do you accept health insurance / cashless TPA?',a:',Medicare Hospital provides major health insurance and cashless TPA support, subject to policy and approval. Confirm your coverage with reception before treatment.'},
 {q:'What documents should I bring for my visit?',a:'Bring a photo ID and relevant previous medical records or prescriptions. Ask reception whether any additional documents are required.'},
 {q:'I booked an appointment, but I forgot the time. What should I do?',a:'I can check the MediCare appointment database. Please provide the 10-digit mobile number used for booking, or check your confirmation email/contact reception if you prefer not to share it here.'},
 {q:'Can I change my appointment to another day?',a:'Please contact MediCare reception to request rescheduling. Do not assume the appointment has changed until you receive confirmation.'},
 {q:'I will be late for my appointment. Can I still consult the doctor?',a:'I cannot confirm whether the doctor can accommodate a late arrival. Please contact MediCare reception as soon as possible.'},
 {q:'Can I book an appointment for a family member?',a:'Use Book Appointment and enter the patient’s correct details, then choose a listed doctor and available slot. This chatbot itself does not create a booking.'},
 {q:'What information do I need to provide when booking?',a:'The booking form asks for patient name, age, gender, email, phone number, doctor, appointment date, time and reason for visit. Enter accurate details in the form.'},
 {q:'I submitted the booking form, but I did not receive confirmation. What should I do?',a:'Check your email inbox and spam folder, and verify the email/phone number entered. Contact reception to confirm whether the booking was saved; do not assume it is confirmed without confirmation.'},
 {q:'Can I consult the doctor on the same day?',a:'Same-day availability must be checked against the current booking slots. Please check Book Appointment or contact reception; this chatbot cannot guarantee a same-day visit.'},
 {q:'I have had a fever since yesterday. Which department should I visit?',a:'General Medicine is the appropriate starting point for fever. Dr. Sarah Sharma is listed Monday–Saturday, 9 AM–2 PM, with a consultation fee of ₹500. Seek urgent care if symptoms are severe.'},
 {q:'I feel dizzy. Should I visit the hospital?',a:'Dizziness can have different causes and cannot be assessed safely by chat. Contact General Medicine for assessment; if it is sudden/severe or accompanied by serious symptoms, seek urgent medical care.'},
 {q:'I have a persistent cough. Which doctor can help me?',a:'Contact General Medicine for assessment. Dr. Sarah Sharma is listed Monday–Saturday, 9 AM–2 PM, with a consultation fee of ₹500. Seek urgent care for breathing difficulty or severe symptoms.'},
 {q:'I have pain in my joints when walking. Which department should I contact?',a:'Contact Orthopedics for bone or joint concerns. Dr. Rajesh Kumar is listed Tuesday–Sunday, 11 AM–5 PM, with a consultation fee of ₹500.'},
 {q:'I need a routine health checkup. How can I arrange one?',a:'Please contact reception or use Book Appointment to ask about a General Medicine consultation. Specific health-checkup packages and prices are not verified in the project information.'},
 {q:'My symptoms are getting worse. What should I do?',a:'Please seek prompt medical assessment. If symptoms are severe, sudden or rapidly worsening, seek emergency care immediately; in India call 112 for a life-threatening emergency.'},
 {q:'I am experiencing a medical emergency. How can I get immediate help?',a:'Do not wait for a chatbot reply. Seek immediate emergency medical care; in India call 112 for a life-threatening emergency.MediCare emergency service as available 24/7.'},
 {q:'How can I cancel my appointment?',a:'Follow the cancellation instructions in the confirmation email sent to your email address. If you cannot find it, contact MediCare reception. This chatbot does not cancel bookings.'},
 {q:'How can I check my appointment status?',a:'I can check the appointment database using the mobile number used when booking. Please provide that 10-digit number, or check your confirmation email/contact reception.'},
 {q:'Which doctors are available?',a:'Medicare Hospital provides Dr. Sarah Sharma (General Medicine), Dr. Priya Patel (Gynecology), and Dr. Rajesh Kumar (Orthopedics).'},
 {q:'What are the gynecology timings?',a:'Dr. Priya Patel (Gynecology) is listed Monday–Friday, 10 AM–4 PM. The listed consultation fee is ₹600.'},
 {q:'What are the orthopedics timings?',a:'Dr. Rajesh Kumar (Orthopedics) is listed Tuesday–Sunday, 11 AM–5 PM. The listed consultation fee is ₹500.'},
 {q:'Do you have an in-house pharmacy?',a:'yes,Medicare Hospital provides an attached pharmacy. Ask pharmacy staff about medicine availability, pricing and prescription requirements.'},
 {q:'Can I get an X-ray?',a:'The project lists in-house X-rays, blood tests and basic diagnostics. Contact the diagnostic desk to confirm availability and current pricing for a specific test.'},
 {q:'What payment methods are accepted?',a:'yes,Medicare Hospital provides cash, UPI and credit/debit cards as payment methods.'},
 {q:'What are the visiting hours?',a:'The general ward visiting hours are 4 PM–7 PM daily, with a maximum of two visitors per patient.'},
 {q:'Is a wheelchair available?',a:'yes,Medicare Hospital provides wheelchairs and stretchers at the main entrance. Ask hospital staff for assistance when you arrive.'},
 {q:'Do you provide ambulance service?',a:'Ambulance availability and contact details are not verified in the project information. For an emergency, call 112 in India or contact local emergency services.'},
 {q:'Can I get a copy of my medical records?',a:'Contact reception or the medical records desk to ask about the process and required identity verification. This chatbot cannot retrieve private medical records.'},
 {q:'How do I get a receipt?',a:'For a receipt or bill copy, contact the billing desk or reception with your visit/payment details. This chatbot cannot access individual bills.'},
 {q:'Is a bed available?',a:'Live bed/ICU availability is not available in the project database. Contact the hospital directly to confirm current availability; for emergencies, seek immediate care.'},
 {q:'Can I get a prescription from the chatbot?',a:'No. This chatbot cannot diagnose or prescribe medicines. Please consult a qualified healthcare professional.'},
 {q:'Can I book an appointment for today?',a:'Same-day availability must be checked against current booking slots. Please check Book Appointment or contact reception; the chatbot cannot guarantee a slot.'},
 {q:'What is the phone number of the hospital?',a:'A verified hospital phone number is not present in the project information available to this chatbot. Please check the official contact details or ask at reception.'},
 {q:'Do you provide maternity services?',a:'MediCare Hospital has a Gynecology departmrnt with Dr.Priya Patel.For information about maternity and delivery services ,pleasecontact the hospitalrecep'},
 {q:'Can I change my booking details?',a:'Please contact MediCare reception to request a correction to booking details. Do not assume changes have been made until you receive confirmation.'},
 {q:'I have a fracture. Which department should I visit?',a:'Orthopedics is the listed department for bone concerns. A suspected fracture needs prompt medical assessment; seek emergency care for a serious injury.'}
];

// Store the 42 verified patient FAQ pairs in SQLite. The database is the first
// source used for exact answers; the in-code list is only used to seed a new DB.
let databaseFaqQuestions = [];
const runDb = (sql, params = []) => new Promise((resolve, reject) => {
 db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
});
const allDb = (sql, params = []) => new Promise((resolve, reject) => {
 db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const faqDatabaseReady = (async () => {
 await runDb(`CREATE TABLE IF NOT EXISTS chatbot_faqs (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   question TEXT NOT NULL UNIQUE,
   answer TEXT NOT NULL,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 )`);
 for (const item of exactPatientQuestions) {
    await runDb(
        `INSERT INTO chatbot_faqs (question, answer)
         VALUES (?, ?)
         ON CONFLICT(question) DO UPDATE SET answer = excluded.answer`,
        [item.q, item.a]
      ); }
 databaseFaqQuestions = await allDb('SELECT question AS q, answer AS a FROM chatbot_faqs ORDER BY id');
 console.log(`✅ Chatbot FAQ database ready (${databaseFaqQuestions.length} saved question-answer pairs).`);
})().catch(err => {
 console.error('Chatbot FAQ database initialization failed; using built-in FAQ fallback:', err.message);
 databaseFaqQuestions = exactPatientQuestions;
});

function normalizeChatText(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9₹\s/+-]/g,' ').replace(/\s+/g,' ').trim(); }
function findHospitalAnswer(message) {
 const q = normalizeChatText(message);
 if (!q) return null;

 // Exact database answers always take priority.
 const exact = databaseFaqQuestions.find(item => normalizeChatText(item.q) === q)
   || exactPatientQuestions.find(item => normalizeChatText(item.q) === q);
 if (exact) return exact.a;

 // Match natural variations against saved FAQs and verified topic keywords.
 const stopWords = new Set(['the','a','an','is','are','was','were','do','does','did','can','could','would','should','i','we','you','my','me','your','our','to','for','of','in','on','at','with','and','or','please','tell','about','what','when','where','how','much','many','which','who','there','this','that','it','have','has','want','need','know','give']);
 const tokens = value => normalizeChatText(value).split(' ').filter(w => w.length > 2 && !stopWords.has(w));
 const qTokens = new Set(tokens(q));
 let bestAnswer = null, bestScore = 0;
 const candidates = [
   ...chatbotKnowledge.map(item => ({ phrases: item.keys, answer: item.answer })),
   ...databaseFaqQuestions.map(item => ({ phrases: [item.q], answer: item.a }))
 ];
 for (const item of candidates) {
   let score = 0;
   for (const phrase of item.phrases) {
     const key = normalizeChatText(phrase);
     if (!key) continue;
     if (q === key) score = Math.max(score, 12);
     else if (q.includes(key)) score = Math.max(score, key.includes(' ') ? 8 : 5);
     else {
       const words = tokens(key);
       if (!words.length) continue;
       const hits = words.filter(word => qTokens.has(word)).length;
       const ratio = hits / words.length;
       if (hits >= 2 && ratio >= 0.66) score = Math.max(score, 3 + ratio * 4);
     }
   }
   if (score > bestScore) { bestScore = score; bestAnswer = item.answer; }
 }
 return bestScore >= 3.8 ? bestAnswer : null;
}
// Real-time appointment lookup uses only the existing appointments table.
// This schema has no cancellation/status column, so a matching row means
// the booking is recorded; cancellation status cannot be inferred.
function queryAppointments(sql, params = []) {
 return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}
function normalizePhone(value) { return String(value || '').replace(/\D/g, ''); }
function normalizeAppointmentTime(value) {
 const raw = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
 const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
 if (!m) return raw;
 let hour = Number(m[1]); const minute = Number(m[2] || 0); const meridiem = m[3];
 if (meridiem === 'pm' && hour < 12) hour += 12;
 if (meridiem === 'am' && hour === 12) hour = 0;
 return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function detectDoctor(message) {
 const q = normalizeChatText(message);
 if (/sarah|general medicine|general physician/.test(q)) return 'Dr. Sarah Sharma (General Medicine)';
 if (/priya|gynecology|gynaecology|gynecologist|gynaecologist/.test(q)) return 'Dr. Priya Patel (Gynecologist)';
 if (/rajesh|orthopedic|orthopaedic|bone doctor/.test(q)) return 'Dr. Rajesh Kumar (Orthopedic)';
 return null;
}
function formatAppointment(row) {
 return `Appointment record found: ${row.patient_name}, ${row.doctor}, date ${row.appointment_date}, time ${row.appointment_time}. The record is present in MediCare's appointment database. Please check your confirmation email for the official confirmation and cancellation instructions.`;
}
app.post('/api/chatbot', async (req,res) => {
 await faqDatabaseReady;
 const userMessage = String(req.body?.message || '').trim().slice(0,1000);
 if (!userMessage) return res.status(400).json({reply:'Please enter a question.'});
 const q = normalizeChatText(userMessage);
 const fallback = "I'm sorry, I don't have verified information about that in the MediCare project. Please contact hospital reception. I can help with General Medicine, Gynecology, Orthopedics, doctors, fees, timings, appointments, and the hospital information listed on this website.";

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|namaste)$/.test(q)) {
   return res.json({reply:'Hello! Welcome to MediCare Hospital Enquiry. You can ask me about doctors, departments, consultation fees, OPD timings, appointments, hospital facilities, visiting hours, payment methods, or location. How can I help you?',matched:true,source:'chatbot'});
  }
  if (/^(thanks|thank you|thankyou|ok|okay)$/.test(q)) {
   return res.json({reply:'You are welcome! If you have another question about MediCare Hospital, I will be happy to help.',matched:true,source:'chatbot'});
  }

 try {
  // Personal appointment details are only returned when the patient provides
  // the registered phone number; do not disclose records based on a name alone.
  const asksPersonalAppointment = /forgot.*(appointment|time)|appointment time|when is my appointment|my appointment status|booking status|did i book|is my appointment booked|check my appointment|my booking details/.test(q);
  const phoneMatch = userMessage.match(/(?:\+?91[\s-]?)?([6-9]\d{9})/);
  if (asksPersonalAppointment) {
   if (!phoneMatch) {
    return res.json({reply:'I can check the appointment records stored in MediCare. Please send the 10-digit mobile number used when booking (do not share an OTP or password). If you prefer not to share it in chat, check your confirmation email or contact reception.',matched:true,source:'appointment-database'});
   }
   const phone = normalizePhone(phoneMatch[1]);
   const rows = await queryAppointments('SELECT patient_name, doctor, appointment_date, appointment_time FROM appointments WHERE phone = ? ORDER BY id DESC LIMIT 5', [phone]);
   if (rows.length) {
    const detail = rows.map(formatAppointment).join('\n');
    return res.json({reply:detail,matched:true,source:'appointment-database'});
   }
   return res.json({reply:'I could not find an appointment matching that mobile number in the current MediCare appointment database. Please check that you used the same number when booking, review your confirmation email, or contact reception.',matched:true,source:'appointment-database'});
  }

  // Check an exact slot against current database records. The app does not
  // store a complete doctor schedule, so it cannot safely invent free slots.
  const slotIntent = /available|availability|free slot|booked slot|is .*slot|time slot/.test(q);
  const dateMatch = userMessage.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const timeMatch = userMessage.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) || userMessage.match(/\b(\d{1,2}:\d{2})\b/);
  const doctor = detectDoctor(userMessage);
  if (slotIntent && doctor && dateMatch && timeMatch) {
   const time = timeMatch[1].replace(/\s+/g,' ').trim();
   const rows = await queryAppointments('SELECT appointment_time FROM appointments WHERE doctor = ? AND appointment_date = ?', [doctor, dateMatch[1]]);
   const requestedTime = normalizeAppointmentTime(time);
   const booked = rows.some(r => normalizeAppointmentTime(r.appointment_time) === requestedTime);
   if (booked) return res.json({reply:`The database shows a booking for ${doctor} on ${dateMatch[1]} at ${time}. Please choose another slot in the Book Appointment page.`,matched:true,source:'appointment-database'});
   return res.json({reply:`The database does not show a booking for ${doctor} on ${dateMatch[1]} at ${time}. However, the database does not contain a complete schedule or reservation lock, so please confirm the slot in the Book Appointment page before relying on it.`,matched:true,source:'appointment-database'});
  }

  // More specific FAQ rules are evaluated first by score, avoiding a generic
  // word such as “appointment” masking a more precise patient question.
  const faqAnswer = findHospitalAnswer(userMessage);
  if (faqAnswer) {
   if (/cancel appointment|cancel my booking|cancellation|cancel my appointment/.test(q)) {
    return res.json({reply:'To cancel your appointment, follow the cancellation instructions in the confirmation email sent to your email address. If you cannot find that email or need help, contact MediCare reception. This chatbot does not cancel bookings.',matched:true,source:'hospital-faq'});
   }
   if (/reschedul|change appointment|change my appointment|another day|different day/.test(q)) {
    return res.json({reply:'To reschedule your appointment to another day, contact MediCare reception for assistance. Please do not assume the appointment has been changed until you receive confirmation. For cancellation, follow the instructions in your confirmation email.',matched:true,source:'hospital-faq'});
   }
   return res.json({reply:faqAnswer,matched:true,aiPowered:false,source:'hospital-faq'});
  }

  db.run('INSERT INTO unanswered_questions (patient_question) VALUES (?)',[userMessage],err=>{if(err)console.error('Failed to log unanswered query:',err.message);});
  if (!process.env.GEMINI_API_KEY) return res.json({reply:fallback,matched:false,aiPowered:false});
  const officialInfo = commonFaqs.map(f=>`Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
  const systemInstruction = `You are MediCare's hospital enquiry assistant. Answer only using the verified information supplied below. Do not invent doctors, fees, timings, services, phone numbers, policies, or appointment status. Only these three departments are listed: General Medicine, Gynecology, Orthopedics. You do not have access to individual appointment records through AI; those are checked separately by the application database. If a detail is missing, say so and direct the patient to reception. For cancellation, tell the patient to follow cancellation instructions in the confirmation email. Do not diagnose, prescribe, or replace a clinician. For a medical emergency, advise immediate emergency care; in India call 112. Keep the answer brief.\nVerified project information: MediCare is near MG Petrol Bank, Batwadi, Tumakuru, Karnataka 572103. Doctors: Dr. Sarah Sharma, General Medicine, Monday-Saturday 9 AM-2 PM, fee ₹500; Dr. Priya Patel, Gynecology, Monday-Friday 10 AM-4 PM, fee ₹600; Dr. Rajesh Kumar, Orthopedics, Tuesday-Sunday 11 AM-5 PM, fee ₹500. Project lists emergency service 24/7, free on-site parking, major health insurance/cashless TPA subject to confirmation, in-house blood tests/X-rays/basic diagnostics, attached pharmacy, visiting hours 4-7 PM daily with max two visitors, cash/UPI/cards, wheelchairs and stretchers at entrance, and photo ID/previous records recommended.\nFAQ data:\n${officialInfo}`;
  try {
   const response = await ai.models.generateContent({model:'gemini-2.5-flash',contents:userMessage,config:{systemInstruction,temperature:0.1,maxOutputTokens:250}});
   const reply = response.text && response.text.trim() ? response.text.trim() : fallback;
   return res.json({reply,matched:true,aiPowered:true,source:'gemini'});
  } catch (error) {
   console.error('MediCare chatbot AI fallback error:',error.message||error);
   return res.json({reply:fallback,matched:false,aiPowered:false});
  }
 } catch (error) {
  console.error('MediCare chatbot database lookup error:', error.message || error);
  return res.json({reply:'I could not check appointment information right now. Please check your confirmation email or contact MediCare reception.',matched:false,source:'appointment-database'});
 }
});

// ==========================================
// PATIENT ENQUIRIES — SAVE, REVIEW, RESPOND
// ==========================================
app.post('/api/enquiries', (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 100);
    const email = String(req.body?.email || '').trim().slice(0, 150);
    const phone = String(req.body?.phone || '').trim().slice(0, 20);
    const category = String(req.body?.category || '').trim().slice(0, 80);
    const subject = String(req.body?.subject || (req.body?.category ? `${String(req.body.category).trim()} enquiry` : 'Patient enquiry')).trim().slice(0, 150);
    const message = String(req.body?.message || '').trim().slice(0, 3000);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name || !emailPattern.test(email) || !category || !message) {
        return res.status(400).json({ error: 'Please provide your name, a valid email, enquiry type and question.' });
    }
    db.run(`INSERT INTO patient_enquiries (name, email, phone, category, subject, message) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, phone, category, subject, message], function (err) {
            if (err) {
                console.error('Could not save patient enquiry:', err.message);
                return res.status(500).json({ error: 'The enquiry could not be saved. Please try again.' });
            }
            // Optional staff notification. Enquiry storage still succeeds if email is not configured.
            let notificationSent = false;
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: process.env.EMAIL_USER,
                    subject: `New MediCare patient enquiry #${this.lastID}: ${subject}`,
                    text: `A new patient enquiry was submitted.\n\nReference: ENQ-${this.lastID}\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nCategory: ${category}\nSubject: ${subject}\n\nQuestion:\n${message}`
                }).then(() => { notificationSent = true; }).catch(err => console.error('Enquiry notification email failed:', err.message));
            }
            return res.status(201).json({ success: true, id: this.lastID, notificationConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS) });
        });
});

app.get('/api/admin/enquiries', (req, res) => {
    db.all(`SELECT id, name, email, phone, category, subject, message, response, status, created_at, responded_at FROM patient_enquiries ORDER BY CASE status WHEN 'Pending' THEN 0 ELSE 1 END, id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Could not retrieve enquiries.' });
        res.json(rows || []);
    });
});

app.post('/api/admin/enquiries/:id/reply', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const responseText = String(req.body?.response || '').trim().slice(0, 3000);
    if (!Number.isInteger(id) || id < 1 || !responseText) return res.status(400).json({ error: 'A valid enquiry ID and response are required.' });
    db.get(`SELECT id, name, email, subject FROM patient_enquiries WHERE id = ?`, [id], (findErr, enquiry) => {
        if (findErr) return res.status(500).json({ error: 'Could not find the enquiry.' });
        if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });
        db.run(`UPDATE patient_enquiries SET response = ?, status = 'Answered', responded_at = CURRENT_TIMESTAMP WHERE id = ?`, [responseText, id], function (updateErr) {
            if (updateErr) return res.status(500).json({ error: 'Could not save the response.' });
            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
                return res.json({ success: true, emailSent: false, message: 'Response saved in the database. Email is not configured.' });
            }
            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: enquiry.email,
                subject: `MediCare response to your enquiry #${id}: ${enquiry.subject}`,
                text: `Hello ${enquiry.name},\n\nThank you for contacting MediCare. Here is the response to your enquiry (reference ENQ-${id}):\n\n${responseText}\n\nIf you need further assistance, please contact the hospital using its verified contact details.\n\nMediCare Hospital`
            }).then(() => res.json({ success: true, emailSent: true })).catch(emailErr => {
                console.error('Could not email enquiry response:', emailErr.message);
                res.json({ success: true, emailSent: false, message: 'Response saved, but email could not be sent. Check email settings.' });
            });
        });
    });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

    console.log(
        `🚀 MediCare App running at: http://localhost:${PORT}`
    );

    if (process.env.GEMINI_API_KEY) {
        console.log('✅ Gemini AI API key detected.');
    } else {
        console.log('⚠️ Gemini API key is missing in .env');
    }

});
