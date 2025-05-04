export interface CommsPlanEntry {
    chan: string;
    name: string;
    freq: string;
    tacan: string;
    ils: string;
    kyFill: string;
  }
  
  // Generate initial comms plan data
  export const generateInitialCommsData = (): CommsPlanEntry[] => {
    const baseData = [
      { chan: "1", name: "Common", freq: "261.000", tacan: "", ils: "——", kyFill: "——" },
      { chan: "2", name: "Big Voice", freq: "253.000", tacan: "", ils: "——", kyFill: "——" },
      { chan: "3", name: "Lincoln Al Ops", freq: "251.000", tacan: "72X", ils: "——", kyFill: "——" },
      { chan: "4", name: "Lincoln Marshal", freq: "257.500", tacan: "", ils: "——", kyFill: "——" },
      { chan: "5", name: "Lincoln Paddles", freq: "255.750", tacan: "", ils: "——", kyFill: "——" },
      { chan: "6", name: "Washington Al Ops", freq: "250.000", tacan: "73X", ils: "——", kyFill: "——" },
      { chan: "7", name: "Washington Marshal", freq: "256.500", tacan: "", ils: "——", kyFill: "——" },
      { chan: "8", name: "Washington Paddles", freq: "254.750", tacan: "", ils: "——", kyFill: "——" },
      { chan: "9", name: "——", freq: "——", tacan: "——", ils: "——", kyFill: "——" },
      { chan: "10", name: "Flex", freq: "——", tacan: "——", ils: "——", kyFill: "——" },
      { chan: "11", name: "Arco", freq: "245.000", tacan: "45X", ils: "——", kyFill: "——" },
      { chan: "12", name: "Shell", freq: "246.000", tacan: "46X", ils: "——", kyFill: "——" },
      { chan: "13", name: "Texaco", freq: "247.000", tacan: "47X", ils: "——", kyFill: "——" },
      { chan: "14", name: "Bloodhound (S-3B)", freq: "248.000", tacan: "48X", ils: "——", kyFill: "——" },
      { chan: "15", name: "Mauler (S-3B)", freq: "249.000", tacan: "49X", ils: "——", kyFill: "——" }
    ];
  
    // Add channels 16-20 with blank entries
    for (let i = 16; i <= 20; i++) {
      baseData.push({ chan: i.toString(), name: "——", freq: "——", tacan: "——", ils: "——", kyFill: "——" });
    }
  
    return baseData;
  };