import crypto from 'node:crypto';
import { config } from './config.js';
import { hashPassword } from './password.js';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sqliteStamp(daysAgo = 0, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 15, 0, 0);
  return `${localDate(d)} ${String(hour).padStart(2, '0')}:15:00`;
}

export function seed(db) {
  const passwordHash = hashPassword(crypto.randomBytes(24).toString('hex'));
  const rng = mulberry32(20261110);
  const insertUser = db.prepare(
    `INSERT INTO users (name, email, phone, role, position, password_hash, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );
  const addUser = (name, email, phone, role, position) =>
    Number(insertUser.run(name, email, phone, role, position, passwordHash).lastInsertRowid);

  db.exec('BEGIN');
  try {
    addUser('Grace Wanjiku', 'principal@mukhaweli.ac.ke', '+254 700 900 001', 'principal', 'Principal');
    addUser('Peter Otieno', 'boarding@mukhaweli.ac.ke', '+254 700 900 002', 'deputy_boarding', 'Deputy Principal — Boarding');
    const academicsId = addUser('Mary Achieng', 'academics@mukhaweli.ac.ke', '+254 700 900 003', 'deputy_academics', 'Deputy Principal — Academics');
    const dosId = addUser('Samuel Kiprono', 'dos@mukhaweli.ac.ke', '+254 700 900 004', 'dos', 'Director of Studies');

    const subjectSpecs = [
      ['MAT', 'Mathematics'],
      ['ENG', 'English'],
      ['KIS', 'Kiswahili'],
      ['BIO', 'Biology'],
      ['CHE', 'Chemistry'],
      ['PHY', 'Physics'],
      ['GEO', 'Geography'],
      ['BST', 'Business Studies'],
    ];
    const subjectId = {};
    const subjectName = {};
    const insertSubject = db.prepare('INSERT INTO subjects (code, name) VALUES (?, ?)');
    for (const [code, name] of subjectSpecs) {
      subjectId[code] = Number(insertSubject.run(code, name).lastInsertRowid);
      subjectName[code] = name;
    }

    const teacherSpecs = [
      ['Jane Mwangi', 'jane.mwangi@mukhaweli.ac.ke', '+254 712 000 101', 'MAT'],
      ['David Ochieng', 'david.ochieng@mukhaweli.ac.ke', '+254 712 000 102', 'ENG'],
      ['Beatrice Njeri', 'beatrice.njeri@mukhaweli.ac.ke', '+254 712 000 103', 'KIS'],
      ['John Kamau', 'john.kamau@mukhaweli.ac.ke', '+254 712 000 104', 'BIO'],
      ['Faith Chebet', 'faith.chebet@mukhaweli.ac.ke', '+254 712 000 105', 'CHE'],
      ['Michael Maina', 'michael.maina@mukhaweli.ac.ke', '+254 712 000 106', 'PHY'],
      ['Rose Atieno', 'rose.atieno@mukhaweli.ac.ke', '+254 712 000 107', 'GEO'],
      ['Kevin Mutua', 'kevin.mutua@mukhaweli.ac.ke', '+254 712 000 108', 'BST'],
    ];
    const teacherId = {};
    for (const [name, email, phone, subjectCode] of teacherSpecs) {
      teacherId[email] = addUser(name, email, phone, 'teacher', `${subjectName[subjectCode]} Teacher`);
    }

    const insertClass = db.prepare(
      'INSERT INTO classes (name, stream, class_teacher_id) VALUES (?, ?, ?)'
    );
    const classSpecs = [
      ['Form 1', 'North', 'jane.mwangi@mukhaweli.ac.ke'],
      ['Form 1', 'South', 'david.ochieng@mukhaweli.ac.ke'],
      ['Form 2', 'North', 'beatrice.njeri@mukhaweli.ac.ke'],
      ['Form 3', 'East', 'john.kamau@mukhaweli.ac.ke'],
      ['Form 4', 'West', 'faith.chebet@mukhaweli.ac.ke'],
    ];
    const classId = {};
    for (const [name, stream, email] of classSpecs) {
      classId[`${name} ${stream}`] = Number(
        insertClass.run(name, stream, teacherId[email]).lastInsertRowid
      );
    }

    const workerSpecs = [
      ['Joseph Kariuki', 'joseph.kariuki@mukhaweli.ac.ke', '+254 713 000 201', 'Hostel Manager — Kilimanjaro'],
      ['Alice Wambui', 'alice.wambui@mukhaweli.ac.ke', '+254 713 000 202', 'Hostel Manager — Kenya'],
      ['Daniel Wekesa', 'daniel.wekesa@mukhaweli.ac.ke', '+254 713 000 203', 'Hostel Manager — Elgon'],
      ['Mercy Nafula', 'mercy.nafula@mukhaweli.ac.ke', '+254 713 000 204', 'Hostel Manager — Aberdare'],
      ['Grace Moraa', 'grace.moraa@mukhaweli.ac.ke', '+254 713 000 205', 'Cook'],
      ['Patrick Ouma', 'patrick.ouma@mukhaweli.ac.ke', '+254 713 000 206', 'Security Officer'],
    ];
    const workerId = {};
    for (const [name, email, phone, position] of workerSpecs) {
      workerId[email] = addUser(name, email, phone, 'worker', position);
    }

    addUser('Dr. Wilson Kiptanui', 'wilson.kiptanui@mukhaweli.ac.ke', '+254 711 000 301', 'bom', 'BOM Chairperson');
    addUser('Mrs. Agnes Muthoni', 'agnes.muthoni@mukhaweli.ac.ke', '+254 711 000 302', 'bom', 'BOM Treasurer');
    addUser('Mr. Philip Odhiambo', 'philip.odhiambo@mukhaweli.ac.ke', '+254 711 000 303', 'bom', 'BOM Secretary');

    const parentSpecs = [
      ['Anne Wairimu', 'anne.wairimu@mukhaweli.ac.ke', '+254 722 100 201'],
      ['Charles Odhiambo', 'charles.odhiambo@mukhaweli.ac.ke', '+254 722 100 202'],
      ['Esther Nyambura', 'esther.nyambura@mukhaweli.ac.ke', '+254 722 100 203'],
      ['George Kiptoo', 'george.kiptoo@mukhaweli.ac.ke', '+254 722 100 204'],
      ['Hellen Akinyi', 'hellen.akinyi@mukhaweli.ac.ke', '+254 722 100 205'],
      ['Isaac Mwangi', 'isaac.mwangi@mukhaweli.ac.ke', '+254 722 100 206'],
      ['Josephine Wanjala', 'josephine.wanjala@mukhaweli.ac.ke', '+254 722 100 207'],
      ['Kenneth Barasa', 'kenneth.barasa@mukhaweli.ac.ke', '+254 722 100 208'],
      ['Lilian Chepkoech', 'lilian.chepkoech@mukhaweli.ac.ke', '+254 722 100 209'],
      ['Martin Onyango', 'martin.onyango@mukhaweli.ac.ke', '+254 722 100 210'],
      ['Nancy Wangari', 'nancy.wangari@mukhaweli.ac.ke', '+254 722 100 211'],
      ['Oscar Omondi', 'oscar.omondi@mukhaweli.ac.ke', '+254 722 100 212'],
    ];
    const parentId = [];
    for (const [name, email, phone] of parentSpecs) {
      parentId.push(addUser(name, email, phone, 'parent', 'Parent / Guardian'));
    }

    const studentSpecs = [
      ['Brian Wairimu', 'Male', 0, 'Form 1 North'],
      ['Cynthia Wairimu', 'Female', 0, 'Form 2 North'],
      ['Kevin Odhiambo', 'Male', 1, 'Form 1 North'],
      ['Mercy Odhiambo', 'Female', 1, 'Form 4 West'],
      ['Faith Nyambura', 'Female', 2, 'Form 1 South'],
      ['John Nyambura', 'Male', 2, 'Form 3 East'],
      ['Victor Kiptoo', 'Male', 3, 'Form 1 North'],
      ['Janet Kiptoo', 'Female', 3, 'Form 1 South'],
      ['Mercy Akinyi', 'Female', 4, 'Form 1 North'],
      ['Samuel Akinyi', 'Male', 4, 'Form 2 North'],
      ['Peter Mwangi', 'Male', 5, 'Form 1 South'],
      ['Lucy Mwangi', 'Female', 5, 'Form 3 East'],
      ['Alex Wanjala', 'Male', 6, 'Form 2 North'],
      ['Diana Wanjala', 'Female', 6, 'Form 4 West'],
      ['Sharon Barasa', 'Female', 7, 'Form 1 North'],
      ['Collins Barasa', 'Male', 7, 'Form 1 South'],
      ['Daniel Chepkoech', 'Male', 8, 'Form 2 North'],
      ['Ruth Chepkoech', 'Female', 8, 'Form 4 West'],
      ['Grace Onyango', 'Female', 9, 'Form 1 South'],
      ['Steve Onyango', 'Male', 9, 'Form 3 East'],
      ['Dennis Wangari', 'Male', 10, 'Form 1 North'],
      ['Naomi Wangari', 'Female', 10, 'Form 2 North'],
      ['Fred Omondi', 'Male', 11, 'Form 3 East'],
      ['Sheila Omondi', 'Female', 11, 'Form 4 West'],
    ];

    const insertStudentUser = db.prepare(
      `INSERT INTO students (user_id, admission_no, class_id, gender, joined_on) VALUES (?, ?, ?, ?, ?)`
    );
    const linkParent = db.prepare(
      'INSERT INTO parent_students (parent_id, student_id, relationship) VALUES (?, ?, ?)'
    );
    const studentId = [];
    studentSpecs.forEach(([name, gender, parentIndex, className], i) => {
      const admission = `MUK/${String(i + 1).padStart(3, '0')}`;
      const userId = addUser(
        name,
        `muk${String(i + 1).padStart(3, '0')}@${config.studentDomain}`,
        null,
        'student',
        'Student'
      );
      const id = Number(
        insertStudentUser.run(userId, admission, classId[className], gender, '2026-01-05').lastInsertRowid
      );
      studentId[i] = id;
      linkParent.run(parentId[parentIndex], id, 'Parent');
    });

    const insertAllocation = db.prepare(
      'INSERT INTO teacher_allocations (teacher_id, class_id, subject_id) VALUES (?, ?, ?)'
    );
    for (const [name, stream] of classSpecs) {
      const cid = classId[`${name} ${stream}`];
      for (const [code] of subjectSpecs) {
        const teacher = teacherSpecs.find((t) => t[3] === code);
        insertAllocation.run(teacherId[teacher[1]], cid, subjectId[code]);
      }
    }

    const insertHostel = db.prepare(
      'INSERT INTO hostels (name, gender, capacity, manager_id) VALUES (?, ?, ?, ?)'
    );
    insertHostel.run('Kilimanjaro', 'Boys', 60, workerId['joseph.kariuki@mukhaweli.ac.ke']);
    insertHostel.run('Kenya', 'Girls', 60, workerId['alice.wambui@mukhaweli.ac.ke']);
    insertHostel.run('Elgon', 'Boys', 50, workerId['daniel.wekesa@mukhaweli.ac.ke']);
    insertHostel.run('Aberdare', 'Girls', 50, workerId['mercy.nafula@mukhaweli.ac.ke']);

    const insertMark = db.prepare(
      `INSERT INTO marks (student_id, subject_id, term, exam_name, score, out_of, updated_by)
       VALUES (?, ?, ?, ?, ?, 100, ?)`
    );
    for (const sid of studentId) {
      for (const [code] of subjectSpecs) {
        const score = 42 + Math.round(rng() * 52);
        insertMark.run(sid, subjectId[code], config.term, config.examName, score, teacherId['jane.mwangi@mukhaweli.ac.ke']);
      }
    }

    const insertFee = db.prepare(
      'INSERT INTO fee_accounts (student_id, term, balance, updated_by) VALUES (?, ?, ?, ?)'
    );
    const feeOptions = [0, 8500, 12000, 15500, 22000, 28500, 34000, 41000];
    const insertPayment = db.prepare(
      `INSERT INTO payments (student_id, amount, method, reference, receipt_no, paid_on, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const paymentMethods = ['M-Pesa', 'Bank Transfer', 'Cash'];
    let receipt = 101;
    studentId.forEach((sid, i) => {
      const balance = feeOptions[Math.floor(rng() * feeOptions.length)];
      insertFee.run(sid, config.term, balance, academicsId);
      if (rng() > 0.25) {
        const count = rng() > 0.55 ? 2 : 1;
        for (let p = 0; p < count; p += 1) {
          const month = 8 + Math.floor(rng() * 3);
          const day = 3 + Math.floor(rng() * 24);
          insertPayment.run(
            sid,
            8000 + Math.round(rng() * 22000),
            paymentMethods[Math.floor(rng() * paymentMethods.length)],
            `REF-${202600 + receipt}`,
            `RCP-2026-${String(receipt).padStart(4, '0')}`,
            `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            academicsId
          );
          receipt += 1;
        }
      }
    });

    db.prepare(
      `INSERT INTO calendar (id, term, year, opening_date, closing_date, exam_start, exam_end)
       VALUES (1, ?, ?, ?, ?, ?, ?)`
    ).run(config.term, config.year, '2026-08-31', '2026-12-04', '2026-11-24', '2026-11-27');

    const insertLesson = db.prepare(
      `INSERT INTO teaching_timetable (class_id, subject_id, teacher_id, day, start_time, end_time, room)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [
      ['08:00', '08:40'],
      ['08:40', '09:20'],
      ['09:20', '10:00'],
      ['10:20', '11:00'],
      ['11:00', '11:40'],
      ['11:40', '12:20'],
      ['14:00', '14:40'],
      ['14:40', '15:20'],
    ];
    classSpecs.forEach(([name, stream], ci) => {
      const cid = classId[`${name} ${stream}`];
      days.forEach((day, di) => {
        periods.forEach(([start, end], pi) => {
          const spec = subjectSpecs[(pi + ci * 3 + di) % subjectSpecs.length];
          const teacher = teacherSpecs.find((t) => t[3] === spec[0]);
          insertLesson.run(
            cid,
            subjectId[spec[0]],
            teacherId[teacher[1]],
            day,
            start,
            end,
            `Room ${10 + ci * 3 + (pi % 3)}`
          );
        });
      });
    });

    const insertExam = db.prepare(
      `INSERT INTO exam_timetable (class_id, subject_id, exam_date, start_time, end_time, venue)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const examDays = ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
    for (const [name, stream] of classSpecs) {
      const cid = classId[`${name} ${stream}`];
      subjectSpecs.forEach(([code], index) => {
        const session = index % 2;
        insertExam.run(
          cid,
          subjectId[code],
          examDays[Math.floor(index / 2)],
          session === 0 ? '08:30' : '11:00',
          session === 0 ? '10:30' : '13:00',
          `Main Hall — ${name} ${stream}`
        );
      });
    }

    const insertRevision = db.prepare(
      `INSERT INTO revision_materials (title, subject_id, class_id, kind, url, notes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertRevision.run(
      'Mathematics Form 4 — Revision Paper 1',
      subjectId.MAT,
      classId['Form 4 West'],
      'note',
      null,
      'Section A (30 marks): Simplify (3x + 2)(x − 5). Solve 2x² − 7x + 3 = 0. A trader bought 40kg of maize at KES 55 per kg and sold it at KES 72 per kg; find the percentage profit. Section B: Work through questions 6–14 of the end-of-term revision booklet, showing all working.',
      4,
      sqliteStamp(6)
    );
    insertRevision.run(
      'Biology Form 3 — Genetics Practice',
      subjectId.BIO,
      classId['Form 3 East'],
      'note',
      null,
      'Key areas: monohybrid crosses, test crosses, sex determination, and pedigree analysis. Practice questions: 1. A heterozygous tall pea plant is crossed with a short plant. Determine the genotypic and phenotypic ratios of F1. 2. Explain why colour blindness is more common in males. 3. Draw a pedigree showing transmission of albinism across three generations.',
      4,
      sqliteStamp(4)
    );
    insertRevision.run(
      'Algebra Drill Set — Form 1',
      subjectId.MAT,
      classId['Form 1 North'],
      'note',
      null,
      'Solve for x: 1) 4x − 7 = 21  2) 3(x + 2) = 27  3) 5x + 3 = 2x + 18  4) x/3 + 4 = 9. Extension: The sum of three consecutive even numbers is 78. Find the numbers.',
      teacherId['jane.mwangi@mukhaweli.ac.ke'],
      sqliteStamp(3)
    );
    insertRevision.run(
      'English Comprehension Practice',
      subjectId.ENG,
      classId['Form 1 South'],
      'note',
      null,
      'Read the passage on page 84 of your class reader. Answer the comprehension questions that follow in full sentences. Pay attention to inference questions and the use of connective devices in your answers.',
      teacherId['david.ochieng@mukhaweli.ac.ke'],
      sqliteStamp(2)
    );
    insertRevision.run(
      'Organic Chemistry Summary Notes',
      subjectId.CHE,
      classId['Form 4 West'],
      'note',
      null,
      'Alkanes, alkenes and alkynes: structure, naming, isomerism and reactions. Remember the test for unsaturation (bromine water decolourises). Practice drawing and naming five isomers of C6H14.',
      teacherId['faith.chebet@mukhaweli.ac.ke'],
      sqliteStamp(5)
    );
    insertRevision.run(
      'Study Skills Handbook',
      null,
      null,
      'note',
      null,
      'Plan a weekly revision timetable. Use active recall: close the book and write down what you remember, then check. Space your practice across subjects and take a 10-minute break after every 50 minutes of study. Sleep at least eight hours before an exam.',
      4,
      sqliteStamp(8)
    );

    const insertComplaint = db.prepare(
      `INSERT INTO complaints
       (sender_id, sender_role, about_student_id, class_id, category, subject, body, status, resolution, resolved_by, resolved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertComplaint.run(
      parentId[0], 'parent', studentId[0], classId['Form 1 North'], 'Fees',
      'Fee statement discrepancy',
      'The fee statement shows a balance of KES 22,000, but I made an M-Pesa payment of KES 15,000 on 12 September. Kindly confirm the receipt has been captured.',
      'open', null, null, null, sqliteStamp(2, 10)
    );
    insertComplaint.run(
      parentId[1], 'parent', studentId[2], classId['Form 1 North'], 'Discipline',
      'Bullying on the dormitory corridor',
      'My son has reported being harassed by older students near the Kilimanjaro corridor after evening prep. Please look into the matter.',
      'resolved',
      'The matter was investigated. The students involved were counselled and a boarding prefect has been assigned to monitor the corridor.',
      dosId, sqliteStamp(1, 14), sqliteStamp(5, 9)
    );
    insertComplaint.run(
      studentId[11], 'student', studentId[11], classId['Form 3 East'], 'Academics',
      'Library opening hours during exams',
      'The library closes at 5:30 pm, but many of us need quiet study space until 8:00 pm during the exam period. Could the hours be extended?',
      'open', null, null, null, sqliteStamp(1, 16)
    );
    insertComplaint.run(
      parentId[10], 'parent', studentId[20], classId['Form 1 North'], 'Academics',
      'Exam timetable clash with music practice',
      'Dennis is expected at music practice at the same time as the Mathematics paper on 24 November. We request guidance on how he should handle this.',
      'open', null, null, null, sqliteStamp(0, 8)
    );
    insertComplaint.run(
      studentId[22], 'student', studentId[22], classId['Form 3 East'], 'Boarding',
      'Low water pressure in Elgon dormitory',
      'The showers on the upper floor of Elgon have had very low water pressure for the last four days, especially in the morning.',
      'open', null, null, null, sqliteStamp(0, 7)
    );
    insertComplaint.run(
      parentId[2], 'parent', studentId[5], classId['Form 3 East'], 'Academics',
      'Request for remedial mathematics classes',
      'John is struggling with Mathematics and would benefit from remedial lessons. Is there a programme available before the end of term?',
      'resolved',
      'John has been placed in the Thursday remedial Mathematics group with Mr. Maina.',
      dosId, sqliteStamp(2, 15), sqliteStamp(7, 11)
    );

    const insertMessage = db.prepare(
      `INSERT INTO parent_messages (sender_id, parent_id, subject, body, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    insertMessage.run(
      2, parentId[0], 'Brian Wairimu — boarding conduct',
      'Dear Parent, I am pleased to report that Brian has settled well in Kilimanjaro and is taking a constructive role in evening prep. We would like to discuss his weekend leave arrangements; please contact the boarding office.',
      sqliteStamp(2, 11)
    );
    insertMessage.run(
      3, parentId[1], 'Fee balance reminder',
      'Dear Parent, the current fee balance for Kevin stands at KES 22,000. Kindly clear the balance before the end of the term so that he can sit for the end-of-term examinations without interruption.',
      sqliteStamp(3, 9)
    );
    insertMessage.run(
      3, parentId[6], 'Parents meeting — 21 November 2026',
      'You are invited to the termly parents meeting on 21 November 2026 at 9:00 am in the school hall. The agenda includes academic performance, fee planning and the 2027 academic calendar.',
      sqliteStamp(1, 13)
    );

    const insertAttendance = db.prepare(
      `INSERT INTO staff_attendance (user_id, work_date, sign_in, sign_out) VALUES (?, ?, ?, ?)`
    );
    for (let back = 0; back < 4; back += 1) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isWeekend) continue;
      workerSpecs.forEach(([name, email], index) => {
        const present = back === 0 ? index < 4 : rng() > 0.1;
        if (!present) return;
        const inHour = index === 4 ? '06' : '06';
        const inMin = String(30 + index * 7).padStart(2, '0');
        const outHour = '17';
        const outMin = String(5 + index * 4).padStart(2, '0');
        insertAttendance.run(
          workerId[email],
          localDate(d),
          `${inHour}:${inMin}`,
          back === 0 ? null : `${outHour}:${outMin}`
        );
      });
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
