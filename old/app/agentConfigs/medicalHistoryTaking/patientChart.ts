/**
 * Patient chart for Mr. Kato - Ophthalmology case
 * To be referenced by the preceptor agent when guiding students
 */

export const patientKatoChart = {
  demographicInfo: {
    name: "Mr. Kato",
    namePronunciation: "Kah-toh",
    age: 75,
    gender: "Male",
    occupation: "Retired postal worker",
    visitDate: "24 Apr 2025",
    caseAuthors: "Dr. Nawaaz Nathoo; Dr. Jane Gardiner; UBC FoM EdTech Learning Design Team"
  },

  chiefComplaint: "Gradual vision loss in the right eye, worsening over the past several weeks.",

  historyOfPresentIllness: `
Mr. Kato is a 75‑year‑old retired postal worker who reports progressive difficulty seeing with his right eye for the past 4–5 months, with noticeable worsening in the last 2–3 weeks. Vision is reduced across the full visual field and is especially problematic when reading or driving at night. He denies ocular pain, photopsia, floaters, trauma, headache, scalp tenderness, jaw claudication, myalgias, fatigue, or fever. No prior ocular surgery.

Pertinent Negatives:
- No transient monocular vision loss or curtain‑like defects.
- No diplopia or neurologic symptoms suggestive of stroke or giant cell arteritis.
  `,

  pastOcularHistory: [
    "Presbyopia (managed with over‑the‑counter reading glasses).",
    "Mild age‑related cataract noted today."
  ],

  pastMedicalHistory: [
    "Type 2 Diabetes Mellitus × 15 years",
    "Minor myocardial infarction 3 years ago",
    "Hyperlipidemia",
    "Essential hypertension"
  ],

  medications: [
    "Metformin 500 mg BID",
    "Gliclazide MR 30 mg daily",
    "Atenolol 25 mg daily",
    "Acetylsalicylic acid 81 mg daily",
    "Atorvastatin 40 mg nightly",
    "Reading glasses (OTC)"
  ],

  allergies: "No known drug allergies.",

  familyHistory: "No family history of glaucoma, macular degeneration, or diabetic eye disease.",

  socialHistory: {
    smoking: "40‑pack‑year history; currently trying to quit.",
    alcohol: "Social intake.",
    residence: "Lives with wife; independent in ADLs."
  },

  reviewOfSystems: "Negative for constitutional, neurologic, rheumatologic, or vascular symptoms.",

  physicalExamination: {
    vitalSigns: {
      bloodPressure: "142/88 mmHg",
      heartRate: "78 bpm",
      respiratoryRate: "16 /min",
      temperature: "36.7 °C",
      spO2: "98 % (room air)"
    },
    
    visualFunction: {
      rightEye: {
        visualAcuity: "20/60",
        visualAcuityPinhole: "20/50"
      },
      leftEye: {
        visualAcuity: "20/30",
        visualAcuityPinhole: "20/25"
      },
      pupils: "Equal, round, reactive to light & accommodation; no RAPD.",
      extraOcularMovements: "Full, no diplopia.",
      confrontationVisualFields: "Full OU."
    },
    
    anteriorSegment: {
      lidsLacrimal: "Normal",
      conjunctivaSclera: "Clear",
      cornea: "Clear",
      anteriorChamber: "Deep & quiet",
      irisLens: "Mild nuclear sclerosis OU"
    },
    
    intraOcularPressure: "Not measured today (to be checked by ophthalmology).",
    
    posteriorSegment: {
      opticDiscs: "Normal colour and contour OU",
      maculae: "Multiple drusen OU",
      vessels: "Dot‑blot retinal hemorrhages OU (↑ OD)",
      peripheralRetina: "Attached; no tears or holes"
    },
    
    neurologic: "Cranial nerves II‑VII grossly intact; no focal deficits."
  },

  assessment: `
Gradual painless unilateral visual decline in a 75‑year‑old man with diabetes:

1. Age‑related cataract (likely primary contributor to acuity loss OD)
2. Non‑proliferative diabetic retinopathy
3. Early age‑related macular degeneration

*Retinal vein/artery occlusion is less likely given the chronic course and preserved fields.*
  `,

  plan: [
    "**Refer to Ophthalmology (urgent – within 2 weeks)** for comprehensive assessment, OCT, fundus photography, IOP measurement, and management of cataract/retinopathy.",
    "**Optimise diabetes control:** communicate with family physician; reinforce glycemic & blood‑pressure targets.",
    "**Smoking cessation counselling.**",
    "**Safety advice:** avoid night driving until reviewed; improve home lighting.",
    "**Follow‑up:** with primary care in 4 weeks or sooner if vision acutely worsens."
  ],

  teachingPoints: [
    "Always test visual acuity **with and without pinhole** to differentiate refractive from pathological causes.",
    "Drusen plus dot‑blot hemorrhages suggest combined AMD and diabetic retinopathy; early referral improves outcomes.",
    "Clarify eye‑care provider roles: **optician** (dispensing), **optometrist** (primary eye care), **ophthalmologist** (medical & surgical management).",
    "Reinforce the importance of multidisciplinary care for diabetic patients with visual symptoms."
  ]
}; 