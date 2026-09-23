// The ESCC muscle list, as data.
//
// Wording of names and functions follows the course handout (ESCC Muscle List). Spelling fixes:
// "Semitendinosos" -> Semitendinosus, "Semimembranosos" -> Semimembranosus, "adduct arm" -> "adducts arm",
// "Stabilize and abducts" -> "Stabilize and abduct". Subscapularis was added to the rotator cuff at the
// instructor's request.
//
// `meshes` are BodyParts3D part ids (FMA numbers). Left/right is read from the dataset part names at build time,
// so each list simply includes both sides. Every id here must exist in public/model/parts.json (see tests/).
//
// Item kinds:
//   muscle - a selectable muscle (may belong to a `group`)
//   group  - a named set of muscles (quadriceps, hamstrings...). Selecting it highlights every member.
//   tendon - a selectable non-muscle structure named in the handout
//   think  - a "Think about it" question from the handout; its meshes are revealed as a region on request

export const SECTIONS = [
  { id: 'facial', title: 'Muscles of Facial Expression', entries: ['frontalis', 'orbicularis-oculi', 'orbicularis-oris'] },
  { id: 'mastication', title: 'Muscles of Mastication (Chewing)', entries: ['temporalis', 'masseter'] },
  { id: 'head', title: 'Muscle That Moves the Head', entries: ['sternocleidomastoid'] },
  { id: 'respiration', title: 'Muscles of Respiration', entries: ['diaphragm', 'external-intercostals', 'internal-intercostals'] },
  { id: 'abdominal', title: 'Muscles of the Abdominal Wall', entries: ['external-oblique', 'internal-oblique', 'transversus-abdominis', 'rectus-abdominis'] },
  { id: 'vertebral', title: 'Muscles of the Vertebral Column', entries: ['erector-spinae'] },
  { id: 'pectoral-girdle', title: 'Muscles Acting on the Pectoral Girdle (Shoulder)', entries: ['pectoralis-minor', 'serratus-anterior', 'trapezius'] },
  { id: 'arm', title: 'Muscles Acting on the Arm', entries: ['pectoralis-major', 'latissimus-dorsi', 'deltoid'] },
  { id: 'rotator-cuff', title: 'Rotator Cuff Muscles', entries: ['rotator-cuff'] },
  { id: 'forearm', title: 'Muscles Acting on the Forearm', entries: ['brachialis', 'biceps-brachii', 'triceps-brachii', 'brachioradialis'] },
  { id: 'wrist-hand', title: 'Muscles Acting on the Wrist and Hand', entries: ['think-forearm-flexors', 'think-forearm-extensors'] },
  { id: 'hip-anterior', title: 'Muscles Acting on the Hip and Femur (Anterior)', entries: ['iliopsoas'] },
  { id: 'hip-lateral-posterior', title: 'Muscles Acting on the Hip and Femur (Lateral and Posterior)', entries: ['tensor-fasciae-latae', 'gluteus-maximus'] },
  { id: 'hip-medial', title: 'Muscles Acting on the Hip and Femur (Medial)', entries: ['think-adductors', 'biceps-femoris', 'semitendinosus', 'semimembranosus'] },
  { id: 'knee-leg', title: 'Muscles Acting on the Knee and Leg', entries: ['quadriceps-femoris', 'sartorius', 'hamstrings'] },
  { id: 'foot', title: 'Muscles Acting on the Foot', entries: ['extensor-digitorum-longus', 'tibialis-anterior', 'gastrocnemius', 'soleus', 'fibularis-longus', 'calcaneal-tendon'] },
];

const HAMSTRING_FN = 'Extension of thigh at hip AND flexion of knee';

export const ITEMS = [
  // ── Facial expression
  { id: 'frontalis', kind: 'muscle', name: 'Frontal belly of occipitofrontalis', aka: ['frontalis', 'occipitofrontalis', 'frontal belly'],
    fn: 'Raises eyebrows, wrinkles forehead', meshes: ['FMA46759', 'FMA46760'] },
  { id: 'orbicularis-oculi', kind: 'muscle', name: 'Orbicularis oculi',
    fn: 'Sphincter muscle around eye, closes eye', meshes: ['FMA46782', 'FMA46783', 'FMA46785', 'FMA46786'] },
  { id: 'orbicularis-oris', kind: 'muscle', name: 'Orbicularis oris',
    fn: 'Sphincter muscle around mouth, closes lips, protrudes lips as in kissing', meshes: ['FMA46841'] },

  // ── Mastication
  { id: 'temporalis', kind: 'muscle', name: 'Temporalis', fn: 'Elevates mandible', meshes: ['FMA49007', 'FMA49008'] },
  { id: 'masseter', kind: 'muscle', name: 'Masseter', fn: 'Elevates mandible, prime mover closing jaw',
    meshes: ['FMA49001', 'FMA49002', 'FMA49004', 'FMA49005'] },

  // ── Head
  { id: 'sternocleidomastoid', kind: 'muscle', name: 'Sternocleidomastoid', aka: ['scm', 'sternomastoid'],
    fn: 'If one muscle contracts it rotates head to opposite side. If both muscles contract causes head flexion.',
    meshes: ['FMA13408', 'FMA13409'] },

  // ── Respiration
  { id: 'diaphragm', kind: 'muscle', name: 'Diaphragm', fn: 'Prime mover for breathing', meshes: ['FMA13295'] },
  { id: 'external-intercostals', kind: 'muscle', name: 'External intercostals', aka: ['external intercostal'],
    fn: 'Elevates ribs during inspiration', note: 'Fibers run inferior and anterior', meshes: ['FMA9756'] },
  { id: 'internal-intercostals', kind: 'muscle', name: 'Internal intercostals', aka: ['internal intercostal'],
    fn: 'Depresses ribs during forced expiration', note: 'Fibers run inferior and posterior', meshes: ['FMA9757'] },

  // ── Abdominal wall
  { id: 'external-oblique', kind: 'muscle', name: 'External oblique', aka: ['external abdominal oblique'],
    fn: 'If one side contracts causes rotation at waist. If both muscles contract causes compression of abdomen',
    note: 'Fibers run inferior and medial', meshes: ['FMA13336', 'FMA13337'] },
  { id: 'internal-oblique', kind: 'muscle', name: 'Internal oblique', aka: ['internal abdominal oblique'],
    fn: 'If one side contracts causes rotation at waist. If both muscles contract causes compression of abdomen and stabilize vertebral column',
    note: 'Fibers run superior and medial. Deep to external oblique.', meshes: ['FMA13892', 'FMA13893'] },
  { id: 'transversus-abdominis', kind: 'muscle', name: 'Transversus abdominis', aka: ['transverse abdominis', 'transversus abdominus'],
    fn: 'Compresses abdomen', note: 'Deep to internal oblique. Fibers run horizontal.', meshes: ['FMA22344', 'FMA22345'] },
  { id: 'rectus-abdominis', kind: 'muscle', name: 'Rectus abdominis', aka: ['rectus abdominus', 'abs'],
    fn: 'Flexes vertebral column', meshes: ['FMA13377', 'FMA13378'] },

  // ── Vertebral column
  { id: 'erector-spinae', kind: 'group', name: 'Erector spinae group', aka: ['erector spinae', 'erector spinae group', 'sacrospinalis'],
    fn: 'If one side contracts, causes lateral flexion of vertebral column. If both muscles contract causes back extension.',
    members: ['iliocostalis', 'longissimus', 'spinalis'] },
  { id: 'iliocostalis', kind: 'muscle', group: 'erector-spinae', name: 'Iliocostalis',
    meshes: ['FMA22740', 'FMA22741', 'FMA22742', 'FMA22743', 'FMA22744', 'FMA22745'] },
  { id: 'longissimus', kind: 'muscle', group: 'erector-spinae', name: 'Longissimus',
    meshes: ['FMA22751', 'FMA22753', 'FMA22754', 'FMA22756', 'FMA22757', 'FMA22758'] },
  { id: 'spinalis', kind: 'muscle', group: 'erector-spinae', name: 'Spinalis',
    meshes: ['FMA22779', 'FMA22780', 'FMA22781', 'FMA22782'] },

  // ── Pectoral girdle
  { id: 'pectoralis-minor', kind: 'muscle', name: 'Pectoralis minor', aka: ['pec minor'],
    fn: 'Moves scapula anteriorly and down', meshes: ['FMA13375', 'FMA13376'] },
  { id: 'serratus-anterior', kind: 'muscle', name: 'Serratus anterior',
    fn: 'Pulls scapula forward when arm goes forward. Rotates scapula superiorly. Stabilizes scapula.', meshes: ['FMA13398', 'FMA13399'] },
  { id: 'trapezius', kind: 'muscle', name: 'Trapezius', aka: ['traps', 'trap'],
    fn: 'Elevates and depresses scapula. Extends head.', meshes: ['FMA33581', 'FMA33583', 'FMA33584', 'FMA33585', 'FMA33586', 'FMA33587'] },

  // ── Arm
  { id: 'pectoralis-major', kind: 'muscle', name: 'Pectoralis major', aka: ['pec major', 'pecs'],
    fn: 'Flexion and adduction of arm', meshes: ['FMA34690', 'FMA34691', 'FMA79979', 'FMA79980', 'FMA45874', 'FMA45875'] },
  { id: 'latissimus-dorsi', kind: 'muscle', name: 'Latissimus dorsi', aka: ['lats', 'lat'],
    fn: 'Extends and adducts arm', meshes: ['FMA13358', 'FMA13359'] },
  { id: 'deltoid', kind: 'muscle', name: 'Deltoid', aka: ['delts', 'delt'],
    fn: 'Prime mover abduction of arm and rotation of arm', meshes: ['FMA34680', 'FMA34681', 'FMA34682', 'FMA34683', 'FMA34684', 'FMA34685'] },

  // ── Rotator cuff
  { id: 'rotator-cuff', kind: 'group', name: 'Rotator cuff muscles', aka: ['rotator cuff', 'sits'],
    fn: 'Stabilize and abduct shoulder', members: ['supraspinatus', 'infraspinatus', 'teres-minor', 'subscapularis'] },
  { id: 'supraspinatus', kind: 'muscle', group: 'rotator-cuff', name: 'Supraspinatus', meshes: ['FMA32544', 'FMA32545'] },
  { id: 'infraspinatus', kind: 'muscle', group: 'rotator-cuff', name: 'Infraspinatus', meshes: ['FMA32547', 'FMA32548'] },
  { id: 'teres-minor', kind: 'muscle', group: 'rotator-cuff', name: 'Teres minor', meshes: ['FMA32553', 'FMA32554'] },
  { id: 'subscapularis', kind: 'muscle', group: 'rotator-cuff', name: 'Subscapularis', meshes: ['FMA13414', 'FMA13415'] },

  // ── Forearm
  { id: 'brachialis', kind: 'muscle', name: 'Brachialis', fn: 'Prime mover elbow flexion', meshes: ['FMA37668', 'FMA37669'] },
  { id: 'biceps-brachii', kind: 'muscle', name: 'Biceps brachii', aka: ['biceps'],
    fn: 'Elbow flexion and rotation', meshes: ['FMA37684', 'FMA37685', 'FMA37686', 'FMA37687'] },
  { id: 'triceps-brachii', kind: 'muscle', name: 'Triceps brachii', aka: ['triceps'],
    fn: 'Elbow extension', meshes: ['FMA37695', 'FMA37696', 'FMA37697', 'FMA37698', 'FMA37699', 'FMA37700'] },
  { id: 'brachioradialis', kind: 'muscle', name: 'Brachioradialis', fn: 'Elbow flexion', meshes: ['FMA38486', 'FMA38487'] },

  // ── Wrist and hand (questions)
  { id: 'think-forearm-flexors', kind: 'think', name: 'Wrist and finger flexors',
    question: 'On which side of the forearm would you find flexors?',
    answer: 'Anterior — the palm side of the forearm.',
    meshes: ['FMA38460', 'FMA38461', 'FMA38463', 'FMA38464', 'FMA38617', 'FMA38618', 'FMA38619', 'FMA38620',
      'FMA38638', 'FMA38639', 'FMA38640', 'FMA38641', 'FMA38479', 'FMA38480', 'FMA38482', 'FMA38484'] },
  { id: 'think-forearm-extensors', kind: 'think', name: 'Wrist and finger extensors',
    question: 'On which side of the forearm would you find extensors?',
    answer: 'Posterior — the back-of-the-hand side of the forearm.',
    meshes: ['FMA38495', 'FMA38496', 'FMA38498', 'FMA38499', 'FMA38501', 'FMA38502', 'FMA38504', 'FMA38505',
      'BP44', 'BP45', 'BP46', 'BP47', 'FMA38519', 'FMA38520', 'FMA38522', 'FMA38523', 'FMA38525', 'FMA38526'] },

  // ── Hip, anterior
  { id: 'iliopsoas', kind: 'group', name: 'Iliopsoas', fn: 'Flex thigh', members: ['iliacus', 'psoas-major'] },
  { id: 'iliacus', kind: 'muscle', group: 'iliopsoas', name: 'Iliacus', fn: 'Flex thigh', meshes: ['FMA22322', 'FMA22323'] },
  { id: 'psoas-major', kind: 'muscle', group: 'iliopsoas', name: 'Psoas major', aka: ['psoas'], fn: 'Flex thigh', meshes: ['FMA22342', 'FMA22343'] },

  // ── Hip, lateral and posterior
  { id: 'tensor-fasciae-latae', kind: 'muscle', name: 'Tensor fasciae latae', aka: ['tfl', 'tensor fascia latae', 'tensor fasciae lata'],
    fn: 'Flexes and abducts thigh', meshes: ['FMA22425', 'FMA22426'] },
  { id: 'gluteus-maximus', kind: 'muscle', name: 'Gluteus maximus', aka: ['glute max', 'glutes'],
    fn: 'Extends thigh', meshes: ['FMA22328', 'FMA22329'] },

  // ── Hip, medial
  { id: 'think-adductors', kind: 'think', name: 'Adductors of the thigh',
    question: 'On which side of the femur would you expect to find adductors?',
    answer: 'Medial — the inner thigh.',
    meshes: ['FMA22452', 'FMA22454', 'FMA22456', 'FMA22457', 'FMA22459', 'FMA22460', 'FMA43886', 'FMA43887',
      'FMA43883', 'FMA43884', 'FMA22450', 'FMA22451'] },
  { id: 'biceps-femoris', kind: 'muscle', group: 'hamstrings', name: 'Biceps femoris', fn: HAMSTRING_FN,
    meshes: ['FMA45888', 'FMA45889', 'FMA45891', 'FMA45892'] },
  { id: 'semitendinosus', kind: 'muscle', group: 'hamstrings', name: 'Semitendinosus', fn: HAMSTRING_FN,
    meshes: ['FMA22358', 'FMA22359'] },
  { id: 'semimembranosus', kind: 'muscle', group: 'hamstrings', name: 'Semimembranosus', fn: HAMSTRING_FN,
    meshes: ['FMA22448', 'FMA22449'] },

  // ── Knee and leg
  { id: 'quadriceps-femoris', kind: 'group', name: 'Quadriceps femoris', aka: ['quadriceps', 'quads', 'quad'],
    fn: 'Extend leg at knee', members: ['rectus-femoris', 'vastus-lateralis', 'vastus-medialis', 'vastus-intermedius'] },
  { id: 'rectus-femoris', kind: 'muscle', group: 'quadriceps-femoris', name: 'Rectus femoris', meshes: ['FMA38928', 'FMA38929'] },
  { id: 'vastus-lateralis', kind: 'muscle', group: 'quadriceps-femoris', name: 'Vastus lateralis', meshes: ['FMA38930', 'FMA38931'] },
  { id: 'vastus-medialis', kind: 'muscle', group: 'quadriceps-femoris', name: 'Vastus medialis', meshes: ['FMA38932', 'FMA38933'] },
  { id: 'vastus-intermedius', kind: 'muscle', group: 'quadriceps-femoris', name: 'Vastus intermedius', meshes: ['FMA38934', 'FMA38935'] },
  { id: 'sartorius', kind: 'muscle', name: 'Sartorius', fn: 'Flexes thigh, rotates thigh laterally, flexes leg', meshes: ['FMA22354', 'FMA22355'] },
  { id: 'hamstrings', kind: 'group', name: 'Hamstrings', aka: ['hamstring', 'hamstring group'],
    fn: 'Hamstrings span both the hip and knee joint, so they produce movement at both joints.',
    members: ['biceps-femoris', 'semitendinosus', 'semimembranosus'] },

  // ── Foot
  { id: 'extensor-digitorum-longus', kind: 'muscle', name: 'Extensor digitorum longus', aka: ['edl'],
    fn: 'Extends toes', meshes: ['FMA22548', 'FMA22549'] },
  { id: 'tibialis-anterior', kind: 'muscle', name: 'Tibialis anterior', aka: ['anterior tibialis'],
    fn: 'Dorsiflexion of foot', meshes: ['FMA22544', 'FMA22545'] },
  { id: 'gastrocnemius', kind: 'muscle', name: 'Gastrocnemius', aka: ['gastroc', 'calf'],
    fn: 'Plantar flexion of foot', note: 'Inserts via Achilles tendon/calcaneal tendon on calcaneus',
    meshes: ['FMA45957', 'FMA45958', 'FMA45960', 'FMA45961'] },
  { id: 'soleus', kind: 'muscle', name: 'Soleus', fn: 'Plantar flexion of foot',
    note: 'Inserts via Achilles tendon/calcaneal tendon on calcaneus. Deep to gastrocnemius.',
    meshes: ['FMA22558', 'FMA22559'] },
  { id: 'fibularis-longus', kind: 'muscle', name: 'Fibularis longus', aka: ['peroneus longus', 'fibularis'],
    fn: 'Plantar flexion of foot and everts foot', note: 'Also called peroneus longus', meshes: ['FMA22552', 'FMA22553'] },
  { id: 'calcaneal-tendon', kind: 'tendon', name: 'Calcaneal (Achilles) tendon', aka: ['achilles tendon', 'calcaneal tendon', 'achilles'],
    note: 'Gastrocnemius and soleus insert via this tendon on the calcaneus.', meshes: ['FMA258847', 'FMA264844'] },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

/** Every mesh id belonging to an item (a group's meshes are its members' meshes). */
export function itemMeshes(item) {
  if (item.kind === 'group') return item.members.flatMap((m) => itemMeshes(ITEM_BY_ID[m]));
  return item.meshes;
}

/** The function text to show for an item; members without their own inherit the group's. */
export function itemFunction(item) {
  if (item.fn) return { text: item.fn, from: item };
  const g = item.group && ITEM_BY_ID[item.group];
  if (g && g.fn) return { text: g.fn, from: g };
  return null;
}

/** Section id an item is listed under (first occurrence; members inherit their group's). */
export function itemSection(item) {
  for (const s of SECTIONS) if (s.entries.includes(item.id)) return s;
  if (item.group) return itemSection(ITEM_BY_ID[item.group]);
  return null;
}
