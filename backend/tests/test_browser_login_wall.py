"""The login-wall gate: what it must catch, and what it must stop catching.

This gate exists because the reveal finder once filled an Instagram login form and armed the page's
own submit as a "send". It is load-bearing and it fails safe, so the temptation is to leave it broad.

Broad turned out to have its own cost. Measured live 2026-07-31, substack.com declined as an auth
wall while the account was demonstrably signed in, which takes an entire site out of the write path
for as long as nobody notices. Sites print "Sign in to ..." in footers, upsells and embedded content
strips, and that copy is not evidence of a wall on a page that is also showing you your own account
menu. So the copy half is overridable by a signed-in affordance and the password half is not.
"""

from backend.apps.agents.browser import browser_send_parse as sp

SIGNED_IN = ('[1]<button "Account menu">\n'
             '[4]<link "Sign in to read more">\n'
             '[7]<textbox "Write a note">')


def test_a_signed_in_page_is_not_a_wall_just_because_it_says_sign_in():
    """The substack shape: login copy sitting next to proof you are already logged in."""
    assert not sp.looks_like_login_wall("https://substack.com/", SIGNED_IN)


def test_a_password_box_convicts_no_matter_who_is_signed_in():
    """The veto is COPY-only on purpose. Whatever a password form is for, a post does not go in it,
    and 'but the user is logged in' is not a reason to start typing into one."""
    assert sp.looks_like_login_wall(
        "https://site.com/x", '[1]<button "Sign out">\n[3]<textbox "Password">')


def test_login_copy_still_convicts_with_nothing_to_weigh_against_it():
    """Without a signed-in affordance the copy is the only evidence there is, and it stands."""
    assert sp.looks_like_login_wall("https://site.com/x", '[4]<link "Log in to X to continue">')


def test_login_urls_are_still_walls_outright():
    """Unchanged, and not overridable: a login URL is the page's own declaration of what it is."""
    assert sp.looks_like_login_wall("https://x.com/i/flow/login", SIGNED_IN)
    assert sp.looks_like_login_wall("https://accounts.google.com/v3/signin/identifier", SIGNED_IN)


def test_the_decline_names_its_own_trigger():
    """The bool alone left a whole site declining with nothing to debug against: no amount of
    re-reading the regexes reproduced substack, because the reason was never written down."""
    assert "url:" in sp.login_wall_reason("https://x.com/i/flow/login", "")
    assert "password field:" in sp.login_wall_reason("https://site.com/x", '[3]<textbox "Password">')
    assert "copy:" in sp.login_wall_reason("https://site.com/x", "Log in to X to continue")
    assert sp.login_wall_reason("https://substack.com/", SIGNED_IN) == ""
