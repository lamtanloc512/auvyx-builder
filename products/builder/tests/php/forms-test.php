<?php
/**
 * Auvyx Form (Modules/Forms): the definition, the HTML, what is sent and where it is kept.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Forms\Forms;

function auvyx_test_form_attrs(): array {
	return array(
		'id'      => 'contact-1',
		'fields'  => array(
			array( 'name' => 'name', 'label' => 'Your name', 'kind' => 'text', 'required' => true ),
			array( 'name' => 'email', 'label' => 'Email', 'kind' => 'email', 'required' => true ),
			array( 'name' => 'topic', 'label' => 'Topic', 'kind' => 'select', 'options' => array( 'Sales', 'Support' ) ),
			array( 'name' => 'agree', 'label' => 'I agree', 'kind' => 'checkbox', 'required' => true ),
			array( 'name' => 'Bad Name', 'label' => 'x', 'kind' => 'text' ),
			array( 'name' => 'file', 'label' => 'x', 'kind' => 'file' ),
		),
		'submit'  => 'Send it',
		'success' => 'Thanks!',
	);
}

auvyx_test(
	'forms: a definition is read from the block, bad fields dropped, a bad id is none',
	static function () {
		$form = Forms::parse( auvyx_test_form_attrs() );
		auvyx_assert_same( 'contact-1', $form['id'] );
		auvyx_assert_same( array( 'name', 'email', 'topic', 'agree' ), array_column( $form['fields'], 'name' ) );
		auvyx_assert_same( 'Send it', $form['submit'] );
		auvyx_assert_same( null, Forms::parse( array( 'id' => '<script>' ) ) );
		auvyx_assert_same( null, Forms::parse( array() ) );
	}
);

auvyx_test(
	'forms: the HTML labels every field, carries the trap, and shows nothing typed as markup',
	static function () {
		$attrs                        = auvyx_test_form_attrs();
		$attrs['fields'][0]['label']  = '<img src=x onerror=alert(1)>';
		$attrs['success']             = '<b>ok</b>';
		$html                         = Forms::html( Forms::parse( $attrs ), 'https://example.com/wp-admin/admin-post.php', array( 'action' => 'auvyx_form' ) );
		auvyx_assert_contains( 'id="auvyx-form-contact-1"', $html, 'form id' );
		auvyx_assert_contains( 'name="_auvyx_hp"', $html, 'the trap' );
		auvyx_assert_contains( 'name="_auvyx_form" value="contact-1"', $html, 'which form' );
		auvyx_assert_contains( 'name="action" value="auvyx_form"', $html, 'the handler' );
		auvyx_assert_contains( '<option value="Sales">Sales</option>', $html, 'choices' );
		auvyx_assert_same( true, (bool) false === strpos( $html, '<img' ) && false === strpos( $html, '<b>' ), 'nothing typed is markup' );
	}
);

auvyx_test(
	'forms: what is sent is checked against the definition',
	static function () {
		$form = Forms::parse( auvyx_test_form_attrs() );
		list( $problems, $answers ) = Forms::validate( $form, array( 'name' => ' Linh ', 'email' => 'linh@example.com', 'topic' => 'Sales', 'agree' => 'yes', 'extra' => 'x' ) );
		auvyx_assert_same( array(), $problems );
		auvyx_assert_same( array( 'Linh', 'linh@example.com', 'Sales', 'yes' ), array_column( $answers, 'value' ) );
		auvyx_assert_same( 'Your name', $answers[0]['label'] );
		auvyx_assert_same( true, (bool) (bool) Forms::validate( $form, array( 'email' => 'linh@example.com', 'agree' => 'yes' ) )[0], 'required' );
		auvyx_assert_same( true, (bool) (bool) Forms::validate( $form, array( 'name' => 'A', 'email' => 'nope', 'agree' => 'yes' ) )[0], 'email' );
		auvyx_assert_same( true, (bool) (bool) Forms::validate( $form, array( 'name' => 'A', 'email' => 'a@b.co', 'agree' => 'yes', 'topic' => 'Hacking' ) )[0], 'a choice not offered' );
		auvyx_assert_same( true, (bool) (bool) Forms::validate( $form, array( 'name' => array( 'a', 'b' ), 'email' => 'a@b.co', 'agree' => 'yes' ) )[0], 'one value' );
		auvyx_assert_same( true, (bool) (bool) Forms::validate( $form, array( 'name' => str_repeat( 'x', 301 ), 'email' => 'a@b.co', 'agree' => 'yes' ) )[0], 'too long' );
	}
);

auvyx_test(
	'forms: the published form is found in the content; a draft is not; entries are kept privately',
	static function () {
		$block = '<!-- wp:auvyx/form ' . wp_json_encode( auvyx_test_form_attrs() ) . ' /-->';
		$page  = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Contact', 'post_content' => wp_slash( '<!-- wp:group --><div class="wp-block-group">' . $block . '</div><!-- /wp:group -->' ) ) );
		$found = Forms::find( 'contact-1' );
		auvyx_assert_same( true, (bool) null !== $found, 'found inside a group' );
		auvyx_assert_same( $page, $found[1] );
		auvyx_assert_same( null, Forms::find( 'missing-form' ) );
		auvyx_assert_same( null, Forms::find( "x' OR 1=1 --" ) );
		wp_update_post( array( 'ID' => $page, 'post_status' => 'draft' ) );
		auvyx_assert_same( null, Forms::find( 'contact-1' ), 'a draft form takes nothing' );
		wp_update_post( array( 'ID' => $page, 'post_status' => 'publish' ) );
		$entry = Forms::keep( $found[0], $page, array( array( 'name' => 'name', 'label' => 'Your name', 'value' => '<script>x</script> "hi"' ) ), '/contact/' );
		auvyx_assert_same( true, (bool) $entry > 0, 'kept' );
		auvyx_assert_same( 'private', get_post_status( $entry ) );
		auvyx_assert_same( '<script>x</script> "hi"', Forms::answers( $entry )[0]['value'], 'kept as sent, shown escaped' );
		auvyx_assert_same( 'contact-1', get_post_meta( $entry, '_auvyx_form', true ) );
		$rendered = do_blocks( $block );
		auvyx_assert_contains( 'admin-post.php', $rendered, 'posts to the handler' );
	}
);

auvyx_test(
	'forms: only this site may send, a few times a minute',
	static function () {
		$home = untrailingslashit( home_url() );
		auvyx_assert_same( true, (bool) Forms::same_site( $home, '' ), 'own origin' );
		auvyx_assert_same( true, (bool) ! Forms::same_site( 'https://evil.example', '' ), 'another origin' );
		auvyx_assert_same( true, (bool) Forms::same_site( '', $home . '/contact/' ), 'no origin: own referer' );
		auvyx_assert_same( true, (bool) ! Forms::same_site( '', 'https://evil.example/' . $home ), 'another referer' );
		auvyx_assert_same( true, (bool) ! Forms::same_site( '', '' ), 'nothing to tell' );
		$ok = 0;
		for ( $i = 0; $i < 7; $i++ ) {
			$ok += Forms::allow( '203.0.113.9', 'rate-form' ) ? 1 : 0;
		}
		auvyx_assert_same( 5, $ok );
		auvyx_assert_same( true, (bool) Forms::allow( '203.0.113.10', 'rate-form' ), 'per address' );
	}
);

auvyx_test(
	'forms: what happens after sending is read from the block, with only safe addresses',
	static function () {
		$attrs             = auvyx_test_form_attrs();
		$plain             = Forms::parse( $attrs );
		auvyx_assert_same( true, $plain['mail'], 'emails by default' );
		auvyx_assert_same( '', $plain['to'] . $plain['redirect'] . $plain['webhook'] );
		$attrs['mail']     = false;
		$attrs['to']       = 'sales@example.com, nope, boss@example.com';
		$attrs['redirect'] = '/thanks';
		$attrs['webhook']  = 'https://hooks.example.com/x';
		$form              = Forms::parse( $attrs );
		auvyx_assert_same( false, $form['mail'] );
		auvyx_assert_same( 'sales@example.com, boss@example.com', $form['to'] );
		auvyx_assert_same( '/thanks', $form['redirect'] );
		auvyx_assert_same( 'https://hooks.example.com/x', $form['webhook'] );
		auvyx_assert_same( '', Forms::safe_url( 'javascript:alert(1)', true ) );
		auvyx_assert_same( '', Forms::safe_url( '//evil.example.com', true ) );
		auvyx_assert_same( '', Forms::safe_url( '/x"><script>', true ) );
		auvyx_assert_same( '', Forms::safe_url( '/thanks', false ), 'a webhook needs a full address' );
		auvyx_assert_same( 'a@b.co, c@d.co', Forms::recipients( 'a@b.co;c@d.co a@b.co x' ) );
	}
);

auvyx_test(
	'forms: choice buttons and web addresses, the same markup as shared/Forms.scala',
	static function () {
		$form = Forms::parse(
			array(
				'id'     => 'survey-1',
				'fields' => array(
					array( 'name' => 'size', 'label' => 'Size', 'kind' => 'radio', 'required' => true, 'options' => array( 'S', 'M' ) ),
					array( 'name' => 'site', 'label' => 'Website', 'kind' => 'url' ),
				),
			)
		);
		$html = Forms::html( $form, '#' );
		auvyx_assert_contains( '<fieldset class="auvyx-form__field auvyx-form__field--choices"><legend class="auvyx-form__label">Size', $html );
		auvyx_assert_contains( 'type="radio" id="auvyx-survey-1-size-1" name="size" value="M" required> M</label>', $html );
		auvyx_assert_contains( 'type="url"', $html );
		auvyx_assert_same( array(), Forms::validate( $form, array( 'size' => 'M', 'site' => 'https://linh.dev' ) )[0] );
		auvyx_assert_same( 1, count( Forms::validate( $form, array( 'size' => 'XL' ) )[0] ), 'a choice that is not offered' );
		auvyx_assert_same( 1, count( Forms::validate( $form, array( 'size' => 'S', 'site' => 'javascript:alert(1)' ) )[0] ), 'not a web address' );
	}
);

auvyx_test(
	'forms: the email goes to the form recipients, replies go to the visitor, nothing typed breaks the headers',
	static function () {
		$sent = array();
		$grab = static function ( $short, $atts ) use ( &$sent ) {
			$sent[] = $atts;
			return true; // short-circuits wp_mail: nothing leaves the test.
		};
		add_filter( 'pre_wp_mail', $grab, 10, 2 );
		$attrs       = auvyx_test_form_attrs();
		$attrs['to'] = 'sales@example.com';
		$form        = Forms::parse( $attrs );
		$answers     = Forms::validate( $form, array( 'name' => "Linh\r\nBcc: x@evil.test", 'email' => 'linh@example.com', 'agree' => 'yes' ) )[1];
		auvyx_assert_same( true, Forms::notify( $form, $answers, 'https://example.com/contact#x' ) );
		auvyx_assert_same( 'sales@example.com', $sent[0]['to'] );
		auvyx_assert_same( true, in_array( 'Reply-To: linh@example.com', $sent[0]['headers'], true ), 'reply to the visitor' );
		auvyx_assert_contains( 'Sent from https://example.com/contact', $sent[0]['message'] );
		$form['mail'] = false;
		auvyx_assert_same( false, Forms::notify( $form, $answers, '/' ), 'mail turned off' );
		$attrs['to'] = '';
		auvyx_assert_same( true, Forms::notify( Forms::parse( $attrs ), $answers, '/' ) );
		auvyx_assert_same( get_option( 'admin_email' ), $sent[1]['to'], 'the administrator by default' );
		remove_filter( 'pre_wp_mail', $grab, 10 );
	}
);

auvyx_test(
	'forms: the CSV has a column per field and never starts a cell with a formula',
	static function () {
		$form = Forms::parse( auvyx_test_form_attrs() );
		$id   = Forms::keep( $form, 0, array( array( 'name' => 'name', 'label' => 'Your name', 'value' => '=HYPERLINK("x")' ) ), '/contact' );
		$rows = Forms::rows( array( $id ) );
		auvyx_assert_same( array( 'Date', 'Form', 'Page', 'Your name' ), $rows[0] );
		auvyx_assert_same( "'=HYPERLINK(\"x\")", $rows[1][3] );
		auvyx_assert_same( 'contact-1', $rows[1][1] );
		wp_delete_post( $id, true );
	}
);
