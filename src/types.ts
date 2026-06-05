export type Hospital = {
  id: string
  name: string
}

export type SynagogueContact = {
  name: string
  role: string
  phone: string
}

export type SynagogueWhatsApp = {
  name: string
  link: string
}

export type SynagogueRepresentative = {
  name: string
  phone: string
}

export type DaveningTime = {
  label: string
  time: string
}

export type Synagogue = {
  id: string
  name: string
  denomination: string
  hospitalId: string
  distance: number
  address: string
  davening: DaveningTime[]
  location: string
  contacts: SynagogueContact[]
  whatsappGroups: SynagogueWhatsApp[]
  representative: SynagogueRepresentative
}

export type Resource = {
  name: string
  hospitalId: string
  distance: number
  notes?: string
}

export type KosherPlace = {
  id: string
  name: string
  hospitalId: string
  distance: number
  address: string
  phone?: string
  isKosher: boolean
}

export type Hotel = {
  id: string
  name: string
  hospitalId: string
  distance: number
  address: string
  phone: string
  shuttleAvailable: boolean
  shabbatFriendly: boolean
  notes?: string
}

export type MikvahEntry = {
  id: string
  name: string
  hospitalId: string
  distance: number
  address: string
  phone: string
  hours: string
}

export type EruvRecord = {
  hospitalId: string
  statusLink: string
  mapLink: string
  contact: {
    name: string
    phone: string
  }
  notes: string
}

export type CommunityWhatsAppGroup = {
  id: string
  name: string
  description: string
  link: string
}

export type JewishMedicalProfessional = {
  name: string
  specialty: string
}

export type BikurCholimContact = {
  name: string
  phone: string
}

export type JewishChaplain = {
  name: string
  phone: string
}

export type HospitalInfo = {
  jewishMedicalProfessionals: JewishMedicalProfessional[]
  bikurCholim: {
    room: string
    contact: BikurCholimContact
  }
  prayerSpace: string
  jewishChaplain: JewishChaplain
  shabbatAccommodations: string
}

export type AppMode = 'home' | 'find' | 'assist'
