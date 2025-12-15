const express = require('express');
const mongoose = require('mongoose');
const port=3000;
const port1=3001;
const { MongoClient, ObjectId } = require('mongodb');
const bodyParser = require('body-parser');
const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
const session = require('express-session');
const { name } = require('ejs');
app.use(session({
  secret: 'data',
  resave: false,
  saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));


mongoose.connect('mongodb://localhost/hotel_management_app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to database!');
})
.catch((error) => {
  console.log('Connection failed!', error);
});

const User = mongoose.model('User', {
  name: String,
  password: String,
  isAdmin: Boolean,
});

const Admin = mongoose.model('Admin', {
  name: String,
  password: String,
  isAdmin: Boolean,
});

const Listing = mongoose.model('Listing', {
  roomType: String,
  amenities: [String],
  price: Number,
  rooms: Number
});

const bookingSchema = new mongoose.Schema({
  listingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  date: Date,
  guests: Number,
  name: String,
  listingName: String,
  approved:Boolean
});


const Booking = mongoose.model('Booking', bookingSchema);

const approval = new mongoose.Schema({
  listingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  date: Date,
  guests: Number,
  isApproved: {
    type: Boolean,
    default: false
  }
});

const approvalbook = mongoose.model('Booking', bookingSchema);
const Approval = mongoose.model('Approval', approval);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const authenticateUser = (req, res, next) => {
  if (req.session.user) {
    req.user = req.session.user;
  }

  if (req.session.userType === 'admin') {
    req.admin = req.session.user;
  }

  next();
};

app.use(authenticateUser);

app.get('/', (req, res) => {
  res.render('login.ejs');
});

app.get('/signup', (req, res) => {
  res.render('signup.ejs');
});

app.post('/signup', (req, res) => {
  const { name, password, isAdmin } = req.body;

  const isAdminUser = isAdmin === 'on' ? true : false;

  const Model = isAdminUser ? Admin : User;

  Model.findOne({ name })
    .then((existingUser) => {
      if (existingUser) {
        res.status(400).send(`${isAdminUser ? 'Admin' : 'User'} already exists`);
      } else {
        const user = new Model({ name, password, isAdmin: isAdminUser });

        user.save()
          .then(() => {
            req.session.userType = isAdminUser ? 'admin' : 'user';
            res.redirect('/home');
          })
          .catch((error) => {
            console.log(error);
            res.status(500).send(`Error creating ${isAdminUser ? 'admin' : 'user'}.`);
          });
      }
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(`Error checking if ${isAdminUser ? 'admin' : 'user'} exists.`);
    });
});
app.post('/', (req, res) => {
  const { name, password } = req.body;

  User.findOne({ name, password })
    .then((user) => {
      if (user) {
        req.session.userType = 'user';
        req.session.userId = user._id;
        req.session.user = user;
        res.redirect('/home');
      } else {
        Admin.findOne({ name, password })
          .then((admin) => {
            if (admin) {
              req.session.userType = 'admin';
              req.session.user = admin;
              req.session.adminId = admin._id;
              res.redirect('/admin-home');
            } else {
              res.status(400).send('Invalid username or password.');
            }
          })
          .catch((error) => {
            console.log(error);
            res.status(500).send('Error logging in.');
          });
      }
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send('Error logging in.');
    });
});
const isAuthenticated = (req, res, next) => {
  if (req.session.userType === 'user') {
    next();
  } else {
    res.redirect('/');
  }
};
app.use(authenticateUser);

app.get('/home', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).exec();
    if (!user) {
      throw new Error('User not found');
    }
    res.render('userhomepage', { username: user.name });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

const isAuthenticatedAdmin = (req, res, next) => {
  if (req.session.userType === 'admin') {
    next();
  }
  
};
app.use(authenticateUser);

app.get('/admin-home', isAuthenticatedAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.session.adminId).exec();
    if (!admin) {
      throw new Error('Admin not found');
    }
    res.render('adminhomepage', { adminid: admin.id });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});


app.get('/add-listing', async (req, res) => {
  const { userType } = req.session;
  if (userType === 'admin') {
    const admin = await Admin.findById(req.session.adminId).exec();
    res.render('listings.ejs', { adminid: admin.id });
  } else {
    res.redirect('/');
  }
});

app.post('/add-listings', (req, res) => {
  const roomType = req.body.roomType;
  const amenities = req.body.amenities;
  const price = req.body.price;
  const quantity = req.body.quantity;

  Listing.findOneAndUpdate(
    { roomType: roomType },
    { $inc: { rooms: quantity }, $set: { amenities: amenities, price: price } },
    { new: true, upsert: true }
  )
    .then(() => {
      res.redirect('/add-listing');
    })
    .catch((error) => {
      console.log(error);
      res.redirect('/add-listing');
    });
});




app.get('/approvals', async (req, res) => {
  const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db('hotel_management_app');
    const bookings = await db.collection('bookings').find().toArray();
    const admin = await Admin.findById(req.session.adminId).exec();
    res.render('approvals.ejs', { bookings: bookings,adminid: admin.id });
  } catch (error) {
    console.log(error);
    res.status(500).send('An error occurred');
  } finally {
    await client.close();
  }
});

app.post('/approvals', async (req, res) => {
  const bookingId = req.body.bookingId;
  const listingId = req.body.listingId;
  const roomType = req.body.roomType;
  const userId = req.body.userId;
  const date = req.body.date;
  const guests = req.body.guests;
  const name = req.body.name;
  const action = req.body.action;

  const client = new MongoClient("mongodb://localhost:27017", { useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db("hotel_management_app");

    if (action === 'approve') {
      const approval = { bookingId, listingId, roomType, userId, date, guests, name, approved: true };
      await db.collection('approvals').insertOne(approval);

      await db.collection('bookings').updateOne(
        { _id: new ObjectId(bookingId) },
        { $set: { approved: true } }
      );
      await db.collection('bookings').deleteOne({ _id: new ObjectId(bookingId) });
    } else if (action === 'reject') {
      
      await db.collection('bookings').deleteOne({ _id: new ObjectId(bookingId) });
      const listing = await db.collection('listings').findOneAndUpdate(
        { _id: new ObjectId(listingId) },
        { $inc: { rooms: 1 } },
        { returnOriginal: false }
      );
      if (!listing) {
        throw new Error('Listing not found');
      }
    }

    res.redirect('/approvals');
  } catch (error) {
    console.log(error);
    res.status(500).send('An error occurred');
  } finally {
    await client.close();
  }
});

app.listen(port, () => {
  console.log(`Admin pages running on port ${port}`);
});

app.get('/bookings', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.redirect('/home');
    return;
  }
  

  const client = new MongoClient("mongodb://localhost:27017", { useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db("hotel_management_app");

    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      throw new Error('User not found');
    }

    const listings = await Listing.find({ rooms: { $gt: 0 } });
      res.render('bookings.ejs', { listings: listings, userName: user.name });

  } catch (error) {
    console.log(error);
    res.status(500).send('An error occurred');
  } finally {
    await client.close();
  }
});


app.post('/bookings', (req, res) => {
  const { listingId, user } = req.body;
  const userId = req.session.userId;
  var date = new Date(req.body.date);
  var month = date.getMonth() + 1;
  var day = date.getDate();
  var year = date.getFullYear();
  date = year + "-" + month + "-" + day;

  const guests = req.body.guests;

  Listing.findById(listingId)
    .then((listing) => {
      if (listing.rooms <= 0) {
        res.redirect("/bookings");
      } else {
        Listing.findOneAndUpdate(
          { _id: listing._id, rooms: { $gt: 0 } },
          { $inc: { rooms: -1 } },
          { new: true }
        )
          .then((updatedListing) => {
            if (!updatedListing) {
              Listing.findByIdAndDelete(listing._id)
                .then(() => {
                  res.redirect('/bookings');
                })
                .catch((error) => {
                  console.log(error);
                  res.status(500).send('Error deleting listing from database.');
                });
            } else {
              const booking = new Booking({
                listingId: updatedListing._id,
                userId,
                date,
                guests,
                name: user,
                listingName: updatedListing.roomType,
                approved: false
              });

              booking.save()
                .then(() => {
                  res.redirect('/bookings');
                })
                .catch((error) => {
                  console.log(error);
                  res.status(500).send('Error saving booking to database.');
                });
            }
          })
          .catch((error) => {
            console.log(error);
            res.status(500).send('Error updating listing in database.');
          });
      }
      
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send('Error finding listing in database.');
    });
});





app.get('/reviews', async (req, res) => {
  const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db('hotel_management_app');
    const approvals = await db.collection('approvals').find().toArray();
    res.render('reviews.ejs', { bookings: approvals });
  } catch (error) {
    console.log(error);
    res.status(500).send('An error occurred');
  } finally {
    await client.close();
  }
});

app.post('/reviews', async (req, res) => {
  const { bookingId, review,rating} = req.body;

  const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db('hotel_management_app');
    const reviews = db.collection('reviews');

    const newReview = {
      bookingId,
      review,
      rating
    };

    await reviews.insertOne(newReview);

    res.redirect('/reviews');
  } catch (error) {
    console.log(error);
    res.status(500).send('An error occurred');
  } finally {
    await client.close();
  }
});



app.get('/aboutuser', async (req, res) => {
  const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db('hotel_management_app');

    const approvals = await db.collection('approvals').find({ approved: true }).toArray();

    const listingIds = approvals.map((approval) => new ObjectId(approval.listingId));
    const listings = await db.collection('listings').find({ _id: { $in: listingIds } }).project({ price: 1, amenities: 1 }).toArray();

    const data = approvals.map((approval) => {
      const listing = listings.find((listing) => listing._id.equals(approval.listingId));
      return { 
        ...approval, 
        price: listing ? listing.price : 0,
        amenities: listing ? listing.amenities : []
      };
    });
    res.render('aboutuser', { bookings: data });
  } catch (error) {
    console.error('Error retrieving approved bookings:', error);
    res.status(500).send('Error retrieving approved bookings');
  } finally {
    await client.close();
  }
});

app.post('/aboutuser', async (req, res) => {
  const { bookingId } = req.body;

  try {
    const booking = await Approval.findById(bookingId);

    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    const listing = await Listing.findByIdAndUpdate(
      booking.listingId,
      { $inc: { rooms: 1 } }
    );

    await Approval.findByIdAndRemove(bookingId);

    res.redirect('/aboutuser');
  } catch (error) {
    console.error('Error canceling booking:', error);
    res.status(500).send('An error occurred while canceling the booking');
  }
});




app.listen(port1, () => {
  console.log(`User pages running on port ${port1}`);
});

