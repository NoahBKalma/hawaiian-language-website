from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine, SessionLocal
import bcrypt

from models import User, FavoriteSet, CardResult
from schemas import UserRegister, UserLogin, AddFavoriteSet, UpdateCardResult
from auth import hash_password, create_access_token, get_current_user, oauth2_scheme

app = FastAPI()
# Allows my frontend to access my backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# creates all the tables defined in models.py with the engine from database.py
Base.metadata.create_all(engine)

def get_db():
    database_session_local = SessionLocal()
    try:
        yield database_session_local
    finally:
        database_session_local.close()
        
# Register's a new account
@app.post("/register")
def user_register(user_data: UserRegister, database = Depends(get_db)):
    
    if(user_data.username == None):
        raise HTTPException(status_code=400, detail="Username missing")
    elif(user_data.username == None):
        raise HTTPException(status_code=400, detail="Email missing")
    elif(user_data.username == None):
        raise HTTPException(status_code=400, detail="Password missing")
        
    # Checks username and email for duplicates first because hashing is slow
    existing_user = database.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Account with this username or email already exists")

    # Creates a user and adds it to the database
    new_user = User(username=user_data.username, email=user_data.email, password_hash=hash_password(user_data.password))
    
    database.add(new_user)
    database.commit()
    return {"message": "User created successfully"}

# Logs user in - gives JWT token
@app.post("/login")
def user_login(login_data: UserLogin, database = Depends(get_db)):
    
    # Checks for an existing user, than checks password equality
    existing_user = database.query(User).filter(
        (User.username == login_data.username) | (User.email == login_data.email)
    ).first()
    
    if not existing_user:
        raise HTTPException(status_code=400, detail="Account with this username or email doesn't exist")

    if bcrypt.checkpw(login_data.password.encode(), existing_user.password_hash.encode()):
        return {"access_token": create_access_token(existing_user.user_id)}
    else:
        raise HTTPException(status_code=401, detail="Password is incorrect")

# Gets user data from currently signed in
@app.get("/signed-in-user")
def user_fetch(token=Depends(oauth2_scheme), database = Depends(get_db)):
    user = get_current_user(token, database)
    return { "username" : user.username }


# Get user's favorites
@app.get("/favorites")
def get_favorites(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    favorites = database.query(FavoriteSet).filter(FavoriteSet.user_id == user.user_id).all()
    return {"favorites": favorites}

# Add/remove a favorite set
@app.post("/favorites")
def toggle_favorite(set_data: AddFavoriteSet, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    existing_favorite_set = database.query(FavoriteSet).filter((FavoriteSet.user_id == user.user_id) & 
                                                               (FavoriteSet.set_name == set_data.set_name)).first()
    if existing_favorite_set:
        database.delete(existing_favorite_set)
    else:
        database.add(FavoriteSet(user_id=user.user_id, set_name=set_data.set_name))
    database.commit()
    return {"favorited": False if existing_favorite_set else True}

# Gets a list of user's results
@app.get("/card-results")
def get_card_results(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    return {"card-results": database.query(CardResult).filter(CardResult.user_id == user.user_id).all()}

# Reset a user's results
@app.post("/card-results/reset")
def reset_card_results(token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    database.query(CardResult).filter(CardResult.user_id == user.user_id).update({
        "correct_count": 0,
        "incorrect_count": 0
    })
    database.commit()
    return {"Reset": True}

# Adds a card's results
@app.post("/card-results")
def add_card_result(card_data: UpdateCardResult, token=Depends(oauth2_scheme), database=Depends(get_db)):
    user = get_current_user(token, database)
    existing_card_result = database.query(CardResult).filter((CardResult.user_id == user.user_id) &
                                                             (CardResult.word_hawaiian == card_data.word_hawaiian)).first()
    if existing_card_result:
        if card_data.result:
            existing_card_result.correct_count += 1
        else:
            existing_card_result.incorrect_count += 1
    else:
        card_correct_count = 1 if card_data.result else 0
        card_incorrect_count = 0 if card_data.result else 1
        database.add(CardResult(user_id=user.user_id, word_hawaiian=card_data.word_hawaiian, correct_count=card_correct_count, incorrect_count=card_incorrect_count))
    database.commit()
    return {"Word Updated": True}
