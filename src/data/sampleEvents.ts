import type { Event } from '../types/EventTypes';

export const SAMPLE_EVENTS: Event[] = [
  {
    id: "1",
    title: "Training Cycle 25-1 Week 4 – A2G1: Bombs",
    description: "Welcome to Week 4 – time to drop some bombs! We'll be launching from the boat to drop a pair of JDAMs and a pair of LGBs each.",
    datetime: "2025-01-30T20:30:00",
    status: "upcoming",
    creator: {
      boardNumber: "637",
      callsign: "Prince",
      billet: "Train OIC"
    },
    attendance: {
      accepted: [
        { boardNumber: "637", callsign: "Prince", billet: "Train OIC" },
        { boardNumber: "551", callsign: "Boot" },
        { boardNumber: "523", callsign: "Grass" }
      ],
      declined: [
        { boardNumber: "556", callsign: "Zapp", billet: "OPS O" },
        { boardNumber: "771", callsign: "Ray" }
      ],
      tentative: []
    },
    restrictedTo: ["Cadre"]
  },
  {
    id: "2",
    title: "Training Cycle 25-1 Week 5 – A2G2: Rockets",
    description: "Rocket week! Time to practice those dive angles.",
    datetime: "2025-02-06T20:30:00",
    status: "upcoming",
    creator: {
      boardNumber: "637",
      callsign: "Prince",
      billet: "Train OIC"
    },
    attendance: {
      accepted: [
        { boardNumber: "637", callsign: "Prince", billet: "Train OIC" },
        { boardNumber: "551", callsign: "Boot" }
      ],
      declined: [],
      tentative: [
        { boardNumber: "523", callsign: "Grass" }
      ]
    },
    restrictedTo: ["Cadre"]
  }
];