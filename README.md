# Wink Derby

A pixel cat race you run with your face. Made for Shared Minds (ITP), the week about embodied cognition.

- **Wink left, wink right** = left paw, right paw. Same eye twice and your cat trips.
- **Open your mouth** = jump over the puddles. Land in one and your cat sits there dripping.
- **Make your cat**: fur, coat pattern, eye colour, face and ears, all drawn as pixels in code. You can dress it with your face too: wink to change an option, open your mouth to move on.
- **Race alone** against three computer cats (one of them falls asleep mid-race), or **make a room** and race up to 4 people online with a 4-letter code.

## How it works

- **Face tracking:** MediaPipe Face Landmarker in the browser. Each eye's "closed-ness" is whichever is stronger: the model's blink score or how much the eyelid gap shrank compared with your calibrated open eye. A short calibration at the start learns your face.
- **Online rooms:** Firebase Realtime Database (`/winkDerby/rooms/{CODE}`), anonymous sign-in. Every player runs their own cat and reports its position about 10 times a second; everyone counts down to the same server time and gets the same puddle layout from a shared seed.
- **Art and sound:** every sprite is a small grid of letters turned into pixels (`cats.js`); sounds are tiny Web Audio blips.

Keyboard works too: F / J to run, SPACE to jump, arrows to dress your cat.

Plain HTML, CSS and JavaScript with p5.js. Open `index.html` through any static server.
