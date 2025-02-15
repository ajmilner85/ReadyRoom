export type QualificationType = 
  | 'Strike Lead' 
  | 'Instructor Pilot' 
  | 'LSO' 
  | '4-Ship' 
  | '2-Ship' 
  | 'CQ' 
  | 'Night CQ';

export interface Qualification {
  id: string;
  type: QualificationType;
  dateAchieved: string;
}

export interface Pilot {
  id: string;
  callsign: string;
  boardNumber: string;
  status: 'Command' | 'Staff' | 'Cadre' | 'Provisional' | 'Inactive' | 'Retired';
  billet: string;
  qualifications: Qualification[];
  discordUsername: string;
}

export const pilots: Pilot[] = [
  {
    "id": "361492687800631299",
    "callsign": "Grekko",
    "boardNumber": "511",
    "status": "Provisional",
    "billet": "",
    "qualifications": [],
    "discordUsername": "_grekko"
  },
  {
    "id": "1187159467180171416",
    "callsign": "Neptune",
    "boardNumber": "514",
    "status": "Provisional",
    "billet": "",
    "qualifications": [
      {
        "id": "1187159467180171416-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "neptuneshelsmn"
  },
  {
    "id": "475719512914657302",
    "callsign": "ION",
    "boardNumber": "516",
    "status": "Staff",
    "billet": "Admin OIC",
    "qualifications": [
      {
        "id": "475719512914657302-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "praetoraugustus"
  },
  {
    "id": "218505330877923336",
    "callsign": "Kirby",
    "boardNumber": "517",
    "status": "Cadre",
    "billet": "",
    "qualifications": [],
    "discordUsername": "glacier419"
  },
  {
    "id": "268727196783345665",
    "callsign": "Grass",
    "boardNumber": "523",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
      {
        "id": "268727196783345665-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "268727196783345665-1",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "grubwyrm"
  },
  {
    "id": "663900837504090132",
    "callsign": "Teamkill",
    "boardNumber": "525",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
      {
        "id": "663900837504090132-0",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "tyarchangel"
  },
  {
    "id": "265513619276562433",
    "callsign": "Mongo",
    "boardNumber": "537",
    "status": "Retired",
    "billet": "CO vVF-161 (RET)",
    "qualifications": [
      {
        "id": "265513619276562433-0",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "265513619276562433-1",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "theonetruemongoloid"
  },
  {
    "id": "285985223022477315",
    "callsign": "Zapp",
    "boardNumber": "556",
    "status": "Staff",
    "billet": "OPS O",
    "qualifications": [
      {
        "id": "285985223022477315-0",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "285985223022477315-1",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "285985223022477315-2",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "285985223022477315-3",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "zapp0651"
  },
  {
    "id": "193203657938960384",
    "callsign": "Flick",
    "boardNumber": "571",
    "status": "Staff",
    "billet": "Intel OIC",
    "qualifications": [
      {
        "id": "193203657938960384-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "193203657938960384-1",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "193203657938960384-2",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "193203657938960384-3",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "wisconsam"
  },
  {
    "id": "225432482445656065",
    "callsign": "Bookworm",
    "boardNumber": "574",
    "status": "Staff",
    "billet": "DS Admin",
    "qualifications": [
      {
        "id": "225432482445656065-0",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "225432482445656065-1",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "225432482445656065-2",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "hexpul"
  },
  {
    "id": "228618266472480778",
    "callsign": "Fowl",
    "boardNumber": "575",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
      {
        "id": "228618266472480778-0",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "flasper"
  },
  {
    "id": "255052449864351745",
    "callsign": "Ryan",
    "boardNumber": "577",
    "status": "Provisional",
    "billet": "",
    "qualifications": [],
    "discordUsername": "ryan3779"
  },
  {
    "id": "300848495349334016",
    "callsign": "Tex",
    "boardNumber": "614",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
      {
        "id": "300848495349334016-0",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "spaghetticowboy"
  },
  {
    "id": "351821199837233152",
    "callsign": "Bean",
    "boardNumber": "615",
    "status": "Provisional",
    "billet": "",
    "qualifications": [],
    "discordUsername": "djchilibeanz"
  },
  {
    "id": "606665644087181341",
    "callsign": "Dolby",
    "boardNumber": "617",
    "status": "Cadre",
    "billet": "",
    "qualifications": [],
    "discordUsername": "showtime8789"
  },
  {
    "id": "163349806427668480",
    "callsign": "Weld",
    "boardNumber": "623",
    "status": "Command",
    "billet": "XO",
    "qualifications": [
      {
        "id": "163349806427668480-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "163349806427668480-1",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "163349806427668480-2",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
      },
      {
        "id": "163349806427668480-3",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
      }
    ],
    "discordUsername": "someoneinabush"
  },
{
    "id": "237333554261000192",
    "callsign": "Wave",
    "boardNumber": "624",
    "status": "Provisional",
    "billet": "",
    "qualifications": [
        {
        "id": "237333554261000192-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "thewave"
    },
    {
    "id": "349328510545952769",
    "callsign": "Mayo",
    "boardNumber": "627",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
        {
        "id": "349328510545952769-0",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": ".mauks"
    },
    {
    "id": "186245895451443205",
    "callsign": "SCUBA",
    "boardNumber": "633",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
        {
        "id": "186245895451443205-0",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "fateoffroyo"
    },
    {
    "id": "248983844764647426",
    "callsign": "Creeper",
    "boardNumber": "636",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
        {
        "id": "248983844764647426-0",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
        },
        {
        "id": "248983844764647426-1",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "nicks812"
    },
    {
    "id": "161244060126937091",
    "callsign": "Prince",
    "boardNumber": "637",
    "status": "Staff",
    "billet": "Train OIC",
    "qualifications": [
        {
        "id": "161244060126937091-0",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
        },
        {
        "id": "161244060126937091-1",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "takemetochurchill"
    },
    {
    "id": "331482431154814978",
    "callsign": "SWAP",
    "boardNumber": "647",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
        {
        "id": "331482431154814978-0",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
        },
        {
        "id": "331482431154814978-1",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "iibeastpro"
    },
    {
    "id": "753113727091343462",
    "callsign": "Red Knight",
    "boardNumber": "664",
    "status": "Provisional",
    "billet": "",
    "qualifications": [
        {
        "id": "753113727091343462-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "mostoblivious"
    },
    {
    "id": "903228161163132939",
    "callsign": "Valknut",
    "boardNumber": "711",
    "status": "Provisional",
    "billet": "",
    "qualifications": [],
    "discordUsername": "drakentoth"
    },
    {
    "id": "244270802306990081",
    "callsign": "JYNX",
    "boardNumber": "717",
    "status": "Command",
    "billet": "CO",
    "qualifications": [
        {
        "id": "244270802306990081-0",
        "type": "4-Ship",
        "dateAchieved": "2024-01-01"
        },
        {
        "id": "244270802306990081-1",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
        },
        {
        "id": "244270802306990081-2",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
        },
        {
        "id": "244270802306990081-3",
        "type": "Instructor Pilot",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "shryke17"
    },
    {
    "id": "425090562341994506",
    "callsign": "SKIPP",
    "boardNumber": "725",
    "status": "Inactive",
    "billet": "",
    "qualifications": [],
    "discordUsername": "cointripod"
    },
    {
    "id": "809647726668677130",
    "callsign": "Broadway",
    "boardNumber": "727",
    "status": "Provisional",
    "billet": "",
    "qualifications": [],
    "discordUsername": "broadway7278"
    },
    {
    "id": "118942689508065280",
    "callsign": "Leodis",
    "boardNumber": "744",
    "status": "Provisional",
    "billet": "",
    "qualifications": [
        {
        "id": "118942689508065280-0",
        "type": "LSO",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "amilner"
    },
    {
    "id": "158801418503979008",
    "callsign": "Ray",
    "boardNumber": "771",
    "status": "Inactive",
    "billet": "",
    "qualifications": [],
    "discordUsername": "hannibal_a6e"
    },
    {
    "id": "442807532973719552",
    "callsign": "Bob",
    "boardNumber": "777",
    "status": "Cadre",
    "billet": "",
    "qualifications": [
        {
        "id": "442807532973719552-0",
        "type": "2-Ship",
        "dateAchieved": "2024-01-01"
        }
    ],
    "discordUsername": "atomatoflames"
    }]