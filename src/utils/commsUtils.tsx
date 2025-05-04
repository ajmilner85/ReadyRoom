import type { CommsPlanEntry } from '../types/CommsTypes';

export const isValidFrequency = (freq: string): boolean => {
  if (freq === '——' || freq === '') return true;
  const freqNum = parseFloat(freq);
  return !isNaN(freqNum) && 
         freqNum >= 225 && 
         freqNum <= 512 && 
         (freqNum * 4) % 1 === 0; // Check for 0.25 spacing
};

export const isValidTACAN = (tacan: string): boolean => {
  if (tacan === '——' || tacan === '') return true;
  const pattern = /^([1-9][0-9]?|1[0-1][0-9]|12[0-6])[XY]$/;
  return pattern.test(tacan);
};

export const isValidILS = (ils: string): boolean => {
  if (ils === '——' || ils === '') return true;
  const ilsNum = parseInt(ils, 10);
  return !isNaN(ilsNum) && Number.isInteger(ilsNum) && ilsNum >= 1 && ilsNum <= 20;
};

export const isValidKYFill = (kyFill: string): boolean => {
  if (kyFill === '——' || kyFill === '') return true;
  const kyFillNum = parseInt(kyFill, 10);
  return !isNaN(kyFillNum) && Number.isInteger(kyFillNum) && kyFillNum >= 1 && kyFillNum <= 6;
};

export const hasFrequencyConflict = (freq: string, entries: CommsPlanEntry[], currentIndex: number): boolean => {
  if (freq === '——' || freq === '') return false;
  const currentFreq = parseFloat(freq);
  return entries.some((entry, index) => {
    if (index === currentIndex || entry.freq === '——' || entry.freq === '') return false;
    return parseFloat(entry.freq) === currentFreq;
  });
};