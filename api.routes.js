const express = require("express");
const router = express.Router();
const db = require('./db')
const docRef = db.collection('classes');
//instructor for api || This gives us a generic result, good for searching but not for specific results


router.get("/instructor/:instructor1", async (req, res) => {
    let instructor1 = req.params.instructor1.toUpperCase();
    if (instructor1.length <=1){
        res.sendStatus(404);
        return;
    }
    

    const query = await docRef.orderBy('instructor').startAt(instructor1).endAt(instructor1 + '\uf8ff').get();
    if (query.empty) {
        res.sendStatus(404)
        return;
    }
    let data = [];
    query.forEach(doc => {
        data.push(doc.data());
    })
    res.json(data);
})
router.get("/result/class", async (req, res) => {
    let params = req.query;
    const query = await docRef
                                .where('instructor', '==', params.instructor)
                                .where('term', '==', params.term)
                                .where('course_number','==',params.course_number)
                                .where('class_section','==',params.class_section).get();
    if (query.empty) {
        res.sendStatus(404)
        return;
    }
    let data = [];
    query.forEach(doc => {
        data.push(doc.data());
    });
    
    
    res.json(data);

})
const ALLOWED_PAGE_SIZES = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 25;

// Used for pagination
// Encodes the last doc of a page into an token so the client can request the next page via startAfter, without needing to know the underlying sort fields.
function encodeCursor(doc) {
    const payload = {
        course_number: doc.get('course_number'),
        class_section: doc.get('class_section'),
        id: doc.id,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// Used for pagination
// Decodes a client-supplied cursor back into startAfter values; returns null on any malformed/tampered input so the route can reject it with 400.
function decodeCursor(cursor) {
    try {
        const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        if (payload.course_number === undefined || payload.class_section === undefined || !payload.id) {
            return null;
        }
        return payload;
    } catch (err) {
        return null;
    }
}

// Returns a paginated list of classes for a given subject and term.
// Cursoris is needed for fetching subsequent pages, otherwise it fetches from "page" 1
router.get("/classes/by-term", async (req, res) => {
  const params = req.query;

  if (!params.subject || !params.term) {
    res.sendStatus(400);
    return;
  }

  let pageSize = Number(params.page_size);
  if (!ALLOWED_PAGE_SIZES.includes(pageSize)) {
    pageSize = DEFAULT_PAGE_SIZE;
  }

  // course_number/class_section/__name__ ordering must stay in sync with encodeCursor/decodeCursor and startAfter below, since cursoring relies on a stable sort.
  let baseQuery = docRef
    .where("subject", "==", params.subject)
    .where("term", "==", params.term)
    .orderBy("course_number", "desc")
    .orderBy("class_section")
    .orderBy("__name__");

  if (params.cursor) {
    const cursorValues = decodeCursor(params.cursor);
    if (!cursorValues) {
      res.sendStatus(400);
      return;
    }

    // Values must be passed in the same order as the orderBy clauses above.
    baseQuery = baseQuery.startAfter(
      cursorValues.course_number,
      cursorValues.class_section,
      cursorValues.id,
    );
  }

  // Fetch one extra doc to determine has_next without a separate count query.
  const query = await baseQuery.limit(pageSize + 1).get();

  const docs = query.docs;
  const has_next = docs.length > pageSize;
  // Drop the extra lookahead doc so the response never exceeds the requested page size.
  const resultDocs = has_next ? docs.slice(0, pageSize) : docs;

  const classes = resultDocs.map((doc) => doc.data());
  // Cursor is derived from the last doc actually returned, not the discarded lookahead doc.
  const next_cursor = has_next
    ? encodeCursor(resultDocs[resultDocs.length - 1])
    : null;

  res.json({ classes, has_next, next_cursor });
})

module.exports = router;
