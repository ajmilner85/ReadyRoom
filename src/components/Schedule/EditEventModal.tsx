// ...existing code...

// Update how we filter for mission commanders
const missionCommanderOptions = useMemo(() => {
  return selectedPilots
    .filter((pilot) => 
      pilot.qualifications.some(qual => 
        /^-[1-4]/.test(qual) // Check for -1, -2, -3, or -4 qualification
      )
    )
    .map((pilot) => ({
      value: pilot.id,
      label: `${pilot.rank} ${pilot.last}`,
    }));
}, [selectedPilots]);

// ...existing code...
