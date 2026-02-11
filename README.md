# Installation
1. Make sure you have the latest version of [node.js](https://nodejs.org) and npm (is usually included in the installation) installed
2. Clone or download the contents of this repo to a folder on your computer
3. From within that folder, run `npm install` to download all project dependencies

# Usage
1. Make sure your PMG3000-D20B is plugged in to a networking device and connected to a active fiber
2. Make sure you can ping the IP of your PMG3000-D20B and access its web interface (default IP is 10.10.1.1/24)
3. Write down your old modem's serial number or Modem-ID (they may not be interchangeable for your device. If unsure, use the Modem-ID!)
4. From within the folder that contains this script, run `npm start`. The script will now guide you through the process step-by-step

# WHY?
I was looking to clean up my networking equipment a bit and trying to get rid of some unnecessary cable clutter. Through my research I stumbled across the Zyxel PMG3000-D20B that is (was?) even provided by Deutsche Telekom (DTAG) to their business customers.
Neat, my current ISP has partnered with DTAG to provide me with fiber so that seemed promising.

Now came the first problem.. I knew I had to provide my ISP (and thereby DTAG) with the new Modem-ID associated with the modem. Some googling revealed my ISP (who shall not be named) doesn't provide its customers with a web portal for doing so..
That wouldn't normally be a problem, but my last support experience via their hotline (all 4+ hours of it), let's just say.. wasn't stellar. Soo there has to be an easier way, right?
Yup, just cloning your old modem's Modem-ID should work. Some more googling led me to [this amazing repo](https://github.com/xvzf/zyxel-gpon-sfp) where I learned that this was pretty easy to do!

Fast forward to the modem arriving and me installing it. All is in place, the default IP is pingable, let's SSH in and get my internet back up and running..
Well, turns out the most recent known (to me) firmware version, **V1.00(ABVJ.1)b1e**, has SSH disabled by default.

![Bombastic cat sideeye](https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExd3I0MXRraDZkaGdwdGZoOW0zZ251Njhob3M5dTQ4bWkxZ3M0MHduayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/wr7oA0rSjnWuiLJOY5/giphy.gif)

Thankfully xvzf has a python script in his repo where it appears the **/cgi/set_sn** endpoint could be used to set the Modem-ID via a GET request. A look into the **sn_config.js** file on the modems web interface confirms that this should work.

![Screenshot of code from sn_config.js](https://github.com/user-attachments/assets/a48a8b80-169b-425c-9c23-5ce619692ec8)

..Except it doesn't. No matter what combination or format I tried, I couldn't get the SN to change, the web server would respond with "1" for successfull exection but nothing ever happened. (More on that later)

At this point, you can just [downgrade the firmware](https://gist.github.com/maurice-w/faeb60bf8201ce70391873bcb9059bc2) (thx to maurice-w for his massivly helpful firmware collection!) to get SSH to work and change your SN using xvzf guide.
But as much as this collection of various firmware versions is awsome, I just feel like running community provided (outdated) firmware should not really be the go-to solution.

With that in mind I started up Ghidra and looked around the **/usr/local/bin/web** binary that is responsible for responding to those cgi requests.
And after no time I figured out why the **/cgi/set_sn** endpoint didn't work for changing the SN, the functionality is missing from the binary..

![Screenshot of pseudo c code for the set_sn function](https://github.com/user-attachments/assets/16d06143-891f-4148-8c5b-25c08b004fd1)

But thankfully there is another endpoint that can be used to set it! **/cgi/set_onu**

With that newly gained knowledge, I sat down and wrote this small node.js script to change the SN of your modem in 6 easy steps through a step-by-step process.
