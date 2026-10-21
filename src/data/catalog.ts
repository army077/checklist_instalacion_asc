// Los valores de las tablas (medidas, pastillas, reguladores) son DE EJEMPLO.
// Sustituir por las Tablas 1, 3, 1.0, 1.4.4 y 2.0 reales.

export type Vars = Record<string, string>
export type Entry = Record<string, string>
export type QuestionPhase = 'logistics' | 'installation'
export type ResponseType = 'yes-no' | 'text' | 'number' | 'choice'

export interface Question {
  id: string
  title: string
  text: (v: Vars, e: Entry) => string
  phase?: QuestionPhase
  responseType?: ResponseType
  options?: string[]
  bullets?: string[]
  why?: string
  photo?: 'required' | 'optional'
  critical?: boolean
  when?: (e: Entry) => boolean
}

export interface Line {
  id: string
  name: string
  icon: string
  entryFields: { key: string; label: string; options: string[] }[]
  derive: (e: Entry) => Vars
  questions: Question[]
}

const pick = <T,>(table: Record<string, T>, key: string, fallback: T): T => table[key] ?? fallback

const shopDims: Record<string, string> = {
  '1313': '2.10 x 1.60 m', '1325': '3.30 x 1.60 m', '1330': '3.70 x 1.60 m', '1336': '4.30 x 1.60 m',
  '1530': '3.70 x 1.90 m', '1536': '4.30 x 1.90 m', '1550': '5.70 x 1.90 m', '1836': '4.30 x 2.20 m',
}
const hpPastilla: Record<string, string> = { '6HP': '3x40 A', '7HP': '3x50 A', '8HP': '3x60 A', '9HP': '3x70 A' }
const hpReg: Record<string, string> = { '6HP': '15 kVA', '7HP': '20 kVA', '8HP': '25 kVA', '9HP': '30 kVA' }

const fiberDims = (m: string) => (/X0R6|X0R3|T6L/.test(m) ? '6.20 x 2.40 m' : '3.80 x 2.20 m')
const wattsPastilla: Record<string, string> = {
  '1000W': '3x32 A', '1500W': '3x40 A', '2000W': '3x50 A', '3000W': '3x63 A', '6000W': '3x100 A', '12000W': '3x160 A',
}
const wattsReg: Record<string, string> = {
  '1000W': '10 kVA', '1500W': '15 kVA', '2000W': '20 kVA', '3000W': '30 kVA', '6000W': '50 kVA', '12000W': '90 kVA',
}
const wattsChiller: Record<string, string> = {
  '1000W': '15', '1500W': '20', '2000W': '25', '3000W': '30', '6000W': '60', '12000W': '100',
}

const bendTable: Record<string, { dims: string; concreto: string; pastilla: string; reg: string; aceite: string }> = {
  '50T 1600mm': { dims: '1.9 x 1.4 x 2.4 m', concreto: '20', pastilla: '3x40 A', reg: '15 kVA', aceite: '120' },
  '63T 1600mm': { dims: '2.0 x 1.5 x 2.5 m', concreto: '20', pastilla: '3x50 A', reg: '20 kVA', aceite: '150' },
  '63T 2500mm': { dims: '3.0 x 1.6 x 2.6 m', concreto: '25', pastilla: '3x50 A', reg: '20 kVA', aceite: '180' },
  '125T 3200mm': { dims: '3.8 x 2.0 x 3.1 m', concreto: '30', pastilla: '3x80 A', reg: '40 kVA', aceite: '300' },
  '160T 3200mm': { dims: '3.9 x 2.2 x 3.2 m', concreto: '35', pastilla: '3x100 A', reg: '50 kVA', aceite: '380' },
  '160T 4000mm': { dims: '4.7 x 2.2 x 3.2 m', concreto: '35', pastilla: '3x100 A', reg: '50 kVA', aceite: '420' },
}

const atcDims: Record<string, string> = {
  'Works ATC 1325': '3.60 x 2.20 x 2.30 m', 'Works ATC 2130': '4.20 x 3.00 x 2.30 m', 'Works ATC 12HP': '3.60 x 2.20 x 2.40 m',
  'Works ATC - Syntec': '3.60 x 2.20 x 2.30 m', 'Works ATC-R': '3.60 x 2.40 x 2.60 m',
}

const yes = (e: Entry, k: string) => e[k] === 'Sí'

export const LINES: Line[] = [
  {
    id: 'shoppro', name: 'Shop Pro', icon: '🪵',
    entryFields: [
      { key: 'modelo', label: 'Modelo', options: Object.keys(shopDims) },
      { key: 'motor', label: 'Motor', options: ['6HP', '7HP', '8HP', '9HP'] },
      { key: 'bomba', label: 'Bomba de vacío', options: ['No', 'Sí, de 10HP', 'Sí, de 7hp Becker'] },
      { key: 'chiller', label: 'Incluye Chiller', options: ['Sí', 'No'] },
      { key: 'neumatico', label: 'Rodillos neumáticos / motor semiautomático', options: ['Sí', 'No'] },
    ],
    derive: (e) => ({
      MEDIDAS: pick(shopDims, e.modelo, '—'),
      FASES: 'Trifásico', PASTILLA: pick(hpPastilla, e.motor, '3x50 A'), REGULADOR: pick(hpReg, e.motor, '20 kVA'),
    }),
    questions: [
      { id: 'espacio', title: 'Espacio y maniobra', text: (v) => `Tu equipo mide ${v.MEDIDAS}. ¿Tienes al menos 10 cm de sobra en el alto y ancho de tus pasillos, y 50 cm de sobra para dar vuelta?`, why: 'Evita que la máquina no pueda entrar el día de la entrega.', photo: 'optional', critical: true },
      { id: 'dist', title: 'Distancia al centro de carga', text: () => 'El lugar donde se colocará el equipo está a menos de 5 metros del centro de carga.', photo: 'optional' },
      { id: 'carga', title: 'Centro de carga', text: (v) => `Tu equipo necesita un centro de carga exclusivo ${v.FASES} a 220V, con pastilla térmica de ${v.PASTILLA}. ¿Ya lo tienes instalado a menos de 5 metros de donde se colocará?`, photo: 'required', critical: true, why: 'Sin energía correcta el técnico no puede encender el equipo.' },
      { id: 'tierra', title: 'Tierra física', text: () => '¿Ya instalaste una varilla de tierra física exclusiva para esta máquina, a menos de 5 metros del equipo?', photo: 'optional', critical: true },
      { id: 'voltaje', title: 'Estabilidad de voltaje', text: (v) => `Es vital que tu voltaje de 220V sea estable. Si en tu zona hay variaciones, ¿ya cuentas con el regulador de ${v.REGULADOR} que requiere tu modelo?`, photo: 'optional' },
      { id: 'neumatico', title: 'Sistema neumático', when: (e) => yes(e, 'neumatico'), text: () => 'Tu equipo usa sistema neumático y requiere aire comprimido. ¿Confirmas que ya cuentas con lo siguiente a menos de 5 metros de la máquina?', bullets: ['Fuente de aire que garantice 90 psi y 100 litros/minuto (compresor mínimo de 2 HP, tanque de 25 L y 7 CFM).', 'Filtro de 5 micras con separador de condensados, válvula de esfera de 1/2" y reducción bushing de 1/2" a 1/4".'], photo: 'required', critical: true },
      { id: 'capacitacion', title: 'Material para capacitación', text: () => 'Para tu capacitación, ¿ya tienes listos los materiales y un equipo de cómputo?', photo: 'optional' },
    ],
  },
  {
    id: 'fiberx0', name: 'Fiber X0', icon: '🔆',
    entryFields: [
      { key: 'modelo', label: 'Modelo', options: ['1515', '1530', 'FiberBlade X0R3', 'FiberBlade X0R6', 'T6L'] },
      { key: 'potencia', label: 'Potencia del láser', options: Object.keys(wattsPastilla) },
      { key: 'voltaje', label: 'Voltaje y fases', options: ['Bifásico 220V', 'Trifásico 220V', 'Trifásico 440V'] },
      { key: 'gas', label: 'Gas principal de corte', options: ['Oxígeno', 'Nitrógeno', 'Aire comprimido de alta presión'] },
      { key: 'neumatico', label: 'Sistema rotativo / rodillos neumáticos', options: ['Sí', 'No'] },
    ],
    derive: (e) => {
      const [fases = 'Trifásico', volt = '220V'] = (e.voltaje || 'Trifásico 220V').split(' ')
      return { MEDIDAS: fiberDims(e.modelo ?? ''), FASES: fases, VOLTAJE: volt, PASTILLA: pick(wattsPastilla, e.potencia, '3x50 A'), REGULADOR: pick(wattsReg, e.potencia, '20 kVA'), GAS: e.gas ?? '—', LITROS: pick(wattsChiller, e.potencia, '25') }
    },
    questions: [
      { id: 'maniobra', title: 'Maniobra y descarga', text: (_v, e) => (/X0R6|X0R3|T6L/.test(e.modelo) ? 'Es obligatorio el uso de montacargas. ¿Ya tienes contratado o cuentas en sitio con un montacargas de al menos 5 toneladas con uñas largas?' : '¿Cuentas con un área despejada y a nivel de piso (sin escalones ni pendientes)?'), photo: 'optional', critical: true },
      { id: 'transito', title: 'Espacios de tránsito', text: (v) => `Tu equipo mide ${v.MEDIDAS}. ¿Tus pasillos y puertas superan esta medida por al menos 20 cm, y tienes 50 cm de sobra para dar vuelta?`, photo: 'optional', critical: true },
      { id: 'carga', title: 'Centro de carga y tierra física', text: (v) => `Tu equipo necesita un centro de carga exclusivo ${v.FASES} a ${v.VOLTAJE}, con pastilla térmica de ${v.PASTILLA}. ¿Ya lo tienes instalado a menos de 5 metros, junto con su varilla de tierra física exclusiva?`, photo: 'required', critical: true },
      { id: 'voltaje', title: 'Estabilidad de voltaje', text: (v) => `Para proteger la electrónica y el láser, el voltaje debe ser estable. Si tienes variaciones, ¿ya cuentas con un regulador electromecánico de ${v.REGULADOR}?`, photo: 'optional' },
      { id: 'gas', title: 'Gases de asistencia al corte', text: (v) => `Según tu proceso usarás ${v.GAS}. ¿Ya tienes los cilindros/tanques en sitio junto con su regulador de alta presión compatible?`, photo: 'required', critical: true },
      { id: 'humos', title: 'Extracción de humos', text: () => '¿Ya instalaste la tubería de PVC o galvanizada de 8 pulgadas con salida al exterior para el extractor de humos?', photo: 'optional', critical: true },
      { id: 'neumatico', title: 'Sistema neumático secundario', when: (e) => yes(e, 'neumatico'), text: () => 'Tu equipo tiene sistema rotativo/rodillos. ¿Tienes suministro de aire comprimido (90 a 120 PSI) listo a menos de 5 metros?', photo: 'optional' },
      { id: 'insumos', title: 'Insumos para capacitación', text: (v) => `¿Ya tienes listos ${v.LITROS} litros de agua tridestilada, una computadora con Windows y cable Ethernet con internet, y tu material de prueba?`, photo: 'optional' },
    ],
  },
  {
    id: 'bendworx', name: 'Bendworx', icon: '🔩',
    entryFields: [{ key: 'modelo', label: 'Modelo y capacidad', options: Object.keys(bendTable) }],
    derive: (e) => { const t = pick(bendTable, e.modelo, bendTable['63T 1600mm']); return { MEDIDAS: t.dims, CONCRETO: t.concreto, PASTILLA: t.pastilla, REGULADOR: t.reg, ACEITE: t.aceite } },
    questions: [
      { id: 'descarga', title: 'Maniobra de descarga', text: () => '¿Cuentas con espacio para la entrada de un camión con plataforma y, si usas grúa tipo pluma, verificaste que no existan obstrucciones de altura como trabes o cableado aéreo?', photo: 'optional', critical: true },
      { id: 'transito', title: 'Espacios de tránsito', text: (v) => `Tu equipo mide ${v.MEDIDAS}. ¿Tus pasillos y puertas superan estas medidas por al menos 50 cm, y tienes 100 cm de sobra para dar vuelta?`, photo: 'optional', critical: true },
      { id: 'piso', title: 'Condiciones del piso', text: (v) => `Debido al peso del equipo, ¿el área de instalación tiene piso de concreto de al menos ${v.CONCRETO} cm de espesor, resistencia de 300 kg/cm² y un nivelado casi perfecto?`, why: 'Es el punto más crítico: un piso inadecuado puede dañar la máquina.', photo: 'required', critical: true },
      { id: 'carga', title: 'Centro de carga y tierra física', text: (v) => `Tu equipo necesita un centro de carga exclusivo de 3 fases a 220V, con pastilla térmica de ${v.PASTILLA}. ¿Ya lo tienes instalado a menos de 5 metros, junto con su varilla de tierra física exclusiva?`, photo: 'required', critical: true },
      { id: 'regulador', title: 'Regulador de voltaje', text: (v) => `Para validar tu garantía y evitar picos, ¿ya cuentas con regulador electromecánico (los electrónicos no son recomendables) de ${v.REGULADOR} trifásico a 220V?`, photo: 'optional' },
      { id: 'aceite', title: 'Aceite hidráulico', text: (v) => `¿Confirmas que el día de la instalación tendrás en sitio ${v.ACEITE} litros de aceite hidráulico ISO VG46 para llenar el tanque?`, why: 'Sin aceite no se puede arrancar el equipo.', critical: true },
      { id: 'material', title: 'Material para capacitación', text: () => 'Para tus pruebas de doblez, ¿tendrás listos materiales metálicos de tus proyectos de producción?' },
    ],
  },
  {
    id: 'graver', name: 'Fiber Graver', icon: '✒️',
    entryFields: [{ key: 'potencia', label: 'Potencia del láser', options: ['30W', '50W'] }],
    derive: () => ({}),
    questions: [
      { id: 'mesa', title: 'Espacio y mesa de trabajo', text: () => 'Tu equipo es de escritorio. ¿Ya tienes una mesa firme y despejada (área sugerida de 2x2 m) en un lugar bien ventilado?', photo: 'optional', critical: true },
      { id: 'pc', title: 'Equipo de cómputo', text: () => 'El software EZCAD LITE solo funciona en Windows. ¿Tienes lista junto a la máquina una computadora con Windows 8 o 10?', critical: true },
      { id: 'regulador', title: 'Conexión eléctrica y regulador', text: () => 'El equipo se conecta a un enchufe normal de 127V. ¿Ya cuentas con un regulador de voltaje de 110V a 1,200VA?', photo: 'optional' },
      { id: 'material', title: 'Material para capacitación', text: () => '¿Tienes a la mano los metales específicos que grabarás en tus proyectos?' },
    ],
  },
  {
    id: 'atc', name: 'Works ATC', icon: '⚙️',
    entryFields: [
      { key: 'modelo', label: 'Modelo', options: Object.keys(atcDims) },
      { key: 'perifericos', label: 'Incluye periféricos', options: ['Sí', 'No'] },
    ],
    derive: (e) => ({ MEDIDAS: pick(atcDims, e.modelo, '3.60 x 2.20 x 2.30 m'), PASTILLA: '3x60 A', REGULADOR: '25 kVA' }),
    questions: [
      { id: 'transito', title: 'Espacios de tránsito y altura', text: (v) => `Tu equipo mide ${v.MEDIDAS}. ¿Tus puertas y pasillos superan estas medidas por al menos 20 cm, y el lugar tiene 1 metro extra de altura libre hacia el techo?`, photo: 'optional', critical: true },
      { id: 'descarga', title: 'Maniobra de descarga', text: () => '¿Cuentas con un área despejada y a nivel de piso (sin escalones o desniveles)?', critical: true },
      { id: 'carga', title: 'Centro de carga y tierra física', text: (v) => `Tu equipo necesita un centro de carga exclusivo trifásico a 220V, con pastilla térmica de ${v.PASTILLA}. ¿Ya lo tienes instalado a menos de 5 metros, junto con su varilla de tierra física exclusiva?`, photo: 'required', critical: true },
      { id: 'voltaje', title: 'Estabilidad de voltaje', text: (v) => `Para proteger los controles y el husillo ATC, el voltaje debe ser estable. Si hay variaciones, ¿ya cuentas con el regulador electromecánico de ${v.REGULADOR}?`, photo: 'optional' },
      { id: 'aire', title: 'Sistema neumático', text: () => 'El cambiador automático de herramientas requiere aire constante. ¿Tienes a menos de 5 metros un compresor de al menos 2 HP (tanque de 100 L) a 90 psi, con filtro de 5 micras, válvula de esfera de 1/2" y reducción a 1/4"?', photo: 'required', critical: true },
      { id: 'insumos', title: 'Insumos para capacitación', text: () => '¿Ya tienes listo un equipo de cómputo con Windows y tus hojas de MDF de prueba?' },
    ],
  },
]

export const lineById = (id: string) => LINES.find((l) => l.id === id)!
