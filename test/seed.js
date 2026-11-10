// Fake test data only (no real people)
module.exports = () => ({
  'Form Responses 1': [
    ['Timestamp', 'Email Address', 'Name', 'Email', 'WhatsApp / Mobile Number', 'University', 'Are you an IEEE Member?', 'How did you become aware of this webinar?', 'Referral code'],
    [new Date(), 'kasun.test@example.com', 'Kasun Perera', 'kasun.test@example.com', '0771234567', 'University Of Ruhuna', 'No', 'Social media', ''],
    [new Date(), 'nimali.test@example.com', 'nimali silva', 'nimali.test@example.com', '+94 71 234 5678', 'Univeresity of Ruhuna', 'Yes', 'Friend', ''],
    [new Date(), 'amal.test@example.com', 'Amal Fernando', 'amal.test@example.com', '0751112222', 'University Of Moratuwa', 'No', 'Friend', ''],
    [new Date(), 'dup@example.com', 'Duplicate Kasun', 'dup@example.com', '077 123 4567', 'University Of Moratuwa', 'No', 'Friend', ''],
  ],
});
