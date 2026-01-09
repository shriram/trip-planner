PURPOSE

When I travel, I often visit several universities/companies/cities. I need a planner to help me coordinate those trips.

Effectively, I want something like a spreadsheet/table interface, with roughly these columns and these types:

- Date : Date (I will provide the first one; auto-populate the rest)
- Day of the week : valid-day-string (auto-populate)
- Daytime : Structured-String (what I will do that day): one of
  - <city> --> <city> or <city> ⭢ <city>, where the first <city> is where I'm spending the previous night and the second <city> is where I'm spending that night
  - name of an organization (can be any string)
  - "personal" (display differently)
- Night : String (where I will sleep that night)
- Other Event : Structured-String (what else might be happening that day, that is relevant to me) - same as Daytime strings
- Other Location : String (where that event is: a city)
- Attend : Boolean (whether I have to attend the other event; if off, it could just be an FYI, e.g., "be aware some people might be less available this day")

The key thing is that I like to try out several different schedules before settling on one. That includes sending schedules to others to get their confirmation, so it's important to have a "pretty-print" button that, for instance, pastes something (rich text?) into my past buffer that I can paste into an email.

When I change a schedule around, it's not as simple as just copying cells in a spreadsheet. For instance, if I decide to do a "what if" where my schedule starts one day later, that might move a bunch of organization visits that were on Fridays into the weekend, which doesn't work. Instead, the visits have to be moved to the next Monday, and the weekend has to be turned into personal days. It is okay to force travel on a weekend day to ensure I'm in the right place for the next organization. Similarly, Attend = true Other events must also stay fixed.

In terms of auto-populating days, etc., you can assume all days will be after 2000 and before 2100. You should signal an error if given a day outside this range. With that info you can accurately figure out the days of the week, leap years, etc., so I don't need to do it.

This is for starters. We'll explore as we go along.

Note that I often need up to 30 days of planning, so don't make the UI too generous with space, while of course also not making it cramped. The size of things in Google Sheets works fairly well, though you can probably make it prettier than that!

Finally, it is very handy to have "Copy" and "Paste" buttons. They transfer the current data model to and from the pasteboard. This way, I can "save" a configuration without having to run a server, just a static Web page. This is also useful during testing: both for me to record the current state before reloading the page, and for you to create interesting test configurations for me. Note that these are different from the Pretty-Print button, which is meant to create pretty, human-readable output.
